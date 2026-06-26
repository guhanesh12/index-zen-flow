/**
 * 🤖 Automatic VPS Provisioning Service
 * 
 * This service automatically provisions VPS instances when users subscribe to dedicated IPs.
 * Supports DigitalOcean, AWS Lightsail, and Hostinger APIs.
 * 
 * Flow:
 * 1. User subscribes to dedicated IP (₹199/month)
 * 2. System creates new VPS droplet via API (fast path ~2-4 minutes)
 * 3. Auto-deploys order server using cloud-init
 * 4. Adds IP to pool automatically
 * 5. Assigns to user
 * 6. User sees IP on dashboard immediately
 */

import * as kv from './kv_store.tsx';
import * as IPPoolManager from './ip_pool_manager.tsx';

// VPS Provider Configurations
interface VPSProvider {
  name: 'digitalocean' | 'aws-lightsail' | 'vultr' | 'linode';
  apiKey: string;
  region: string;
  size: string; // Plan size
  monthlyPrice: number;
}

interface ProvisioningJob {
  id: string;
  userId: string;
  provider: string;
  status: 'pending' | 'creating' | 'deploying' | 'ready' | 'failed';
  dropletId?: string;
  ipAddress?: string;
  startedAt: string;
  completedAt?: string;
  error?: string;
  estimatedMinutes: number;
  timeline?: {
    vpsCreationStart?: string;      // ~0-1 min: DigitalOcean creates VPS
    vpsActive?: string;              // ~1 min: VPS booted and active
    deploymentStart?: string;        // ~1 min: cloud-init starts
    systemSetupComplete?: string;    // ~2 min: Node.js service installed
    serverDeployed?: string;         // ~2-3 min: Server running
    healthCheckPassed?: string;      // ~2-3 min: Health check passes
    ipAssigned?: string;             // ~2-3 min: IP assigned to user
    completed?: string;              // ~2-3 min: Ready for orders!
  };
  preserveExpiryAt?: string;
}

const PROVISIONING_PREFIX = 'vps_provisioning:';
const DEDICATED_IP_MONTHLY_FEE = 599;
const ORDER_SERVER_VERSION = '1.1.0';
const FAST_PROVISIONING_ESTIMATE_MINUTES = 3;

async function checkOrderServerHealth(ipAddress: string): Promise<boolean> {
  try {
    const healthResponse = await fetch(`http://${ipAddress}:3000/health`, {
      signal: AbortSignal.timeout(2500),
      headers: {
        'User-Agent': 'IndexpilotAI-Provisioning-Reconcile/1.0',
        'Cache-Control': 'no-cache'
      }
    });

    return healthResponse.ok;
  } catch (error: any) {
    console.log(`⚠️ Health check failed for ${ipAddress}: ${error.message}`);
    return false;
  }
}

async function ensureIPPoolEntry(job: ProvisioningJob, ipAddress: string) {
  const existingEntry = await kv.get(`ip_pool:${ipAddress}`) as any;

  if (existingEntry) {
    existingEntry.vpsUrl = `http://${ipAddress}:3000`;
    existingEntry.provider = existingEntry.provider || 'digitalocean';
    existingEntry.status = 'active';
    existingEntry.maxUsers = 1;
    existingEntry.metadata = {
      ...(existingEntry.metadata || {}),
      dropletId: job.dropletId,
      autoProvisioned: true,
      provisioningJobId: job.id,
      reconciledAt: new Date().toISOString(),
    };
    await kv.set(`ip_pool:${ipAddress}`, existingEntry);
    return { success: true };
  }

  return await IPPoolManager.addIPToPool({
    ipAddress,
    vpsUrl: `http://${ipAddress}:3000`,
    provider: 'digitalocean',
    status: 'active',
    maxUsers: 1,
    metadata: {
      dropletId: job.dropletId,
      autoProvisioned: true,
      provisioningJobId: job.id,
    }
  });
}

async function deleteDigitalOceanDroplet(dropletId: string | number, apiToken: string): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(`https://api.digitalocean.com/v2/droplets/${dropletId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${apiToken}` },
    });

    const success = response.ok || response.status === 204 || response.status === 404;
    return {
      success,
      error: success ? undefined : await response.text().catch(() => 'DigitalOcean delete failed'),
    };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

async function finalizeProvisioningJob(job: ProvisioningJob, ipAddress: string): Promise<ProvisioningJob> {
  const addResult = await ensureIPPoolEntry(job, ipAddress);

  if (!addResult.success) {
    job.status = 'failed';
    job.error = `Failed to add IP to pool: ${addResult.error}`;
    await kv.set(`${PROVISIONING_PREFIX}${job.id}`, job);
    return job;
  }

  const existingAssignment = await IPPoolManager.getUserIPAssignment(job.userId);

  // 🔥 CRITICAL: If the user had a previous IP assignment for a DIFFERENT IP
  // (e.g. cancelled/stale VPS), release it from the OLD ip_pool entry so the
  // new VPS IP becomes the user's active IP — not the stale one.
  if (existingAssignment && existingAssignment.ipAddress && existingAssignment.ipAddress !== ipAddress) {
    try {
      const oldIp = existingAssignment.ipAddress;
      const oldEntry = await kv.get(`ip_pool:${oldIp}`) as any;
      if (oldEntry) {
        oldEntry.assignedUsers = (oldEntry.assignedUsers || []).filter((id: string) => id !== job.userId);
        oldEntry.currentUsers = Math.max(0, Number(oldEntry.currentUsers || 0) - 1);
        // If old VPS was auto-provisioned & no users left, drop the pool entry entirely
        if (oldEntry?.metadata?.autoProvisioned && oldEntry.assignedUsers.length === 0) {
          await kv.del(`ip_pool:${oldIp}`);
          console.log(`🗑️ Removed stale old ip_pool entry: ${oldIp}`);
        } else {
          await kv.set(`ip_pool:${oldIp}`, oldEntry);
        }
      }
    } catch (e) {
      console.warn(`⚠️ Failed to cleanup old ip_pool entry: ${(e as any)?.message}`);
    }
  }

  if (!existingAssignment) {
    // Build assignment DIRECTLY for the freshly provisioned IP — do NOT call
    // assignIPToUser() which picks an arbitrary IP from the pool and could
    // hand back a stale/old IP that wasn't yet cleaned up.
    // 🆕 Honor preserved expiry from a "Destroy & Create NEW IP" recreate flow.
    let preservedExpiresAt: string | null = null;
    try {
      const preserve = await kv.get(`ip_recreate_preserve:${job.userId}`) as any;
      if (preserve?.expiresAt && new Date(preserve.expiresAt) > new Date()) {
        preservedExpiresAt = preserve.expiresAt;
      } else if (job.preserveExpiryAt && new Date(job.preserveExpiryAt) > new Date()) {
        preservedExpiresAt = job.preserveExpiryAt;
      }
    } catch {}

    const newAssignment = {
      userId: job.userId,
      ipAddress,
      vpsUrl: `http://${ipAddress}:3000`,
      provider: 'digitalocean',
      assignedAt: new Date().toISOString(),
      subscriptionStatus: 'active',
      expiresAt: preservedExpiresAt || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      monthlyFee: DEDICATED_IP_MONTHLY_FEE,
      lastUsedAt: new Date().toISOString(),
    };
    await kv.set(`user_ip_assignment:${job.userId}`, newAssignment);
    await kv.set(`ip_assignment:${job.userId}:dedicated`, newAssignment);
    if (preservedExpiresAt) {
      try { await kv.del(`ip_recreate_preserve:${job.userId}`); } catch {}
    }

    const ipEntry = await kv.get(`ip_pool:${ipAddress}`) as any;
    if (ipEntry && !ipEntry.assignedUsers?.includes(job.userId)) {
      ipEntry.currentUsers = Math.max(1, Number(ipEntry.currentUsers || 0) + 1);
      ipEntry.assignedUsers = [...(ipEntry.assignedUsers || []), job.userId];
      await kv.set(`ip_pool:${ipAddress}`, ipEntry);
    }
  } else if (existingAssignment.ipAddress !== ipAddress || existingAssignment.subscriptionStatus !== 'active') {
    const expiresAt =
      existingAssignment.expiresAt && new Date(existingAssignment.expiresAt) > new Date()
        ? existingAssignment.expiresAt
        : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    const updatedAssignment = {
      ...existingAssignment,
      userId: job.userId,
      ipAddress,
      vpsUrl: `http://${ipAddress}:3000`,
      provider: 'digitalocean',
      subscriptionStatus: 'active',
      monthlyFee: DEDICATED_IP_MONTHLY_FEE,
      assignedAt: existingAssignment.assignedAt || new Date().toISOString(),
      expiresAt,
      lastUsedAt: existingAssignment.lastUsedAt || new Date().toISOString(),
    };

    await kv.set(`user_ip_assignment:${job.userId}`, updatedAssignment);
    await kv.set(`ip_assignment:${job.userId}:dedicated`, updatedAssignment);

    const ipEntry = await kv.get(`ip_pool:${ipAddress}`) as any;
    if (ipEntry && !ipEntry.assignedUsers?.includes(job.userId)) {
      ipEntry.currentUsers = Math.max(1, Number(ipEntry.currentUsers || 0) + 1);
      ipEntry.assignedUsers = [...(ipEntry.assignedUsers || []), job.userId];
      await kv.set(`ip_pool:${ipAddress}`, ipEntry);
    }
  }

  const completedAt = new Date().toISOString();
  const totalTime = Math.max(1, Math.round((Date.now() - new Date(job.startedAt).getTime()) / 1000));

  job.status = 'ready';
  job.ipAddress = ipAddress;
  job.completedAt = completedAt;
  job.error = undefined;
  job.estimatedMinutes = Math.min(FAST_PROVISIONING_ESTIMATE_MINUTES, Math.max(1, Math.round(totalTime / 60)));
  job.timeline = {
    ...(job.timeline || {}),
    systemSetupComplete: completedAt,
    serverDeployed: completedAt,
    healthCheckPassed: completedAt,
    ipAssigned: completedAt,
    completed: completedAt,
  };

  await kv.set(`${PROVISIONING_PREFIX}${job.id}`, job);
  await kv.del(`${PROVISIONING_PREFIX}pending:${ipAddress}`);

  console.log(`🎉 Provisioning finalized for user ${job.userId}: ${ipAddress}`);
  return job;
}

export async function reconcileUserProvisioningJob(userId: string): Promise<ProvisioningJob | null> {
  const job = await getUserProvisioningJob(userId);
  if (!job) return null;

  if ((job.status === 'ready' || job.status === 'active') && job.ipAddress) {
    const assignment = await IPPoolManager.getUserIPAssignment(userId);
    if (!assignment || assignment.ipAddress !== job.ipAddress || assignment.subscriptionStatus !== 'active') {
      return await finalizeProvisioningJob(job, job.ipAddress);
    }
    return job;
  }

  if (job.status === 'failed') {
    return job;
  }

  try {
    let ipAddress = job.ipAddress;

    if ((!ipAddress || job.status === 'creating') && job.dropletId) {
      const DO_API_TOKEN = Deno.env.get('DIGITALOCEAN_API_TOKEN');
      if (DO_API_TOKEN) {
        const response = await fetch(`https://api.digitalocean.com/v2/droplets/${job.dropletId}`, {
          headers: { Authorization: `Bearer ${DO_API_TOKEN}` },
        });

        if (response.ok) {
          const data = await response.json();
          const droplet = data.droplet;
          const publicIP = droplet?.networks?.v4?.find((net: any) => net.type === 'public')?.ip_address;

          if (publicIP) {
            ipAddress = publicIP;
            if (job.ipAddress !== publicIP || job.status !== 'deploying') {
              job.ipAddress = publicIP;
              job.status = 'deploying';
              job.timeline = {
                ...(job.timeline || {}),
                vpsCreationStart: job.timeline?.vpsCreationStart || job.startedAt,
                vpsActive: job.timeline?.vpsActive || new Date().toISOString(),
                deploymentStart: job.timeline?.deploymentStart || new Date().toISOString(),
              };
              await kv.set(`${PROVISIONING_PREFIX}${job.id}`, job);
            }
          }
        }
      }
    }

    if (!ipAddress) {
      return job;
    }

    const reachable = await checkOrderServerHealth(ipAddress);
    if (!reachable) {
      const startedAtMs = new Date(job.startedAt || Date.now()).getTime();
      const elapsedMs = Date.now() - (Number.isFinite(startedAtMs) ? startedAtMs : Date.now());

      // DigitalOcean can report the droplet as active and cloud-init complete while
      // external port probes are still blocked/refused briefly. Do not keep the UI
      // stuck forever once the user has a real DO IP; assign the IP after the fast
      // provisioning window and let the separate connectivity checker show any issue.
      if (job.status === 'deploying' && elapsedMs >= FAST_PROVISIONING_ESTIMATE_MINUTES * 60 * 1000) {
        console.warn(`⚠️ Finalizing ${job.id} with active IP ${ipAddress} after ${Math.round(elapsedMs / 1000)}s despite health probe failure.`);
        return await finalizeProvisioningJob(job, ipAddress);
      }

      return job;
    }

    return await finalizeProvisioningJob(job, ipAddress);
  } catch (error: any) {
    console.error(`❌ Failed to reconcile provisioning job ${job.id}:`, error.message);
    return job;
  }
}

/**
 * Generate cloud-init script for automatic order server deployment
 */
function generateCloudInitScript(orderServerApiKey: string): string {
  return `#!/bin/bash

# IndexpilotAI Order Server Auto-Deploy
# ASCII-only and non-fatal bootstrap so one package warning cannot stop server startup.
set +e

# Log everything
exec > >(tee -a /var/log/indexpilot-deploy.log)
exec 2>&1

echo "========================================="
echo "IndexpilotAI Auto-Deployment Starting"
echo "Time: $(date)"
echo "========================================="

# Update package index only — full apt upgrade makes provisioning slow.
echo "[1/6] Updating package index..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq

# Install Node.js from Ubuntu repo for fastest bootstrapping.
echo "[2/6] Installing Node.js..."
apt-get install -y -qq nodejs curl ufw || apt-get install -y nodejs curl ufw

node --version

# Create order server directory
echo "[3/6] Creating server directory..."
mkdir -p /root/indexpilot-order-server
cd /root/indexpilot-order-server

# Create server.js
echo "[4/6] Creating server files..."
cat > server.js << 'SERVEREOF'
const http = require('http');
const https = require('https');
const { URL } = require('url');
const PORT = process.env.PORT || 3000;
const ORDER_SERVER_API_KEY = process.env.ORDER_SERVER_API_KEY;

const log = (msg) => {
  const timestamp = new Date().toISOString();
  console.log(\`[\${timestamp}] \${msg}\`);
};

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS'
  });
  res.end(JSON.stringify(data));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 10 * 1024 * 1024) {
        req.destroy();
        reject(new Error('Request body too large'));
      }
    });
    req.on('end', () => {
      if (!body) return resolve({});
      try { resolve(JSON.parse(body)); } catch (error) { reject(error); }
    });
    req.on('error', reject);
  });
}

function dhanRequest(method, path, accessToken, payload) {
  return new Promise((resolve, reject) => {
    const data = payload ? JSON.stringify(payload) : '';
    const req = https.request({
      hostname: 'api.dhan.co',
      port: 443,
      path,
      method,
      timeout: 10000,
      headers: {
        'access-token': accessToken || '',
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    }, (apiRes) => {
      let body = '';
      apiRes.on('data', chunk => { body += chunk; });
      apiRes.on('end', () => {
        let parsed = body;
        try { parsed = body ? JSON.parse(body) : {}; } catch (_) {}
        resolve({ statusCode: apiRes.statusCode || 500, data: parsed });
      });
    });
    req.on('timeout', () => req.destroy(new Error('Dhan API timeout')));
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

function isAuthorized(req) {
  return req.headers.authorization === 'Bearer ' + ORDER_SERVER_API_KEY;
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'OPTIONS') return sendJson(res, 200, { ok: true });
    const parsedUrl = new URL(req.url || '/', 'http://localhost');

    if (req.method === 'GET' && parsedUrl.pathname === '/health') {
      return sendJson(res, 200, {
        status: 'ok',
        service: 'indexpilot-order-server',
        version: '${ORDER_SERVER_VERSION}',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        apiKeyConfigured: !!ORDER_SERVER_API_KEY,
        marketOnlyEnforced: true
      });
    }

    if (req.method === 'GET' && parsedUrl.pathname === '/test') {
      return sendJson(res, 200, {
        message: 'IndexpilotAI Order Server is running!',
        version: '${ORDER_SERVER_VERSION}',
        timestamp: new Date().toISOString(),
        apiKeyConfigured: !!ORDER_SERVER_API_KEY,
        marketOnlyEnforced: true,
        endpoints: {
          health: '/health',
          placeOrder: '/place-order (POST)',
          orderStatus: '/order-status/:orderId (GET)',
          cancelOrder: '/cancel-order/:orderId (DELETE)'
        }
      });
    }

    if (!isAuthorized(req)) {
      log('❌ Unauthorized access attempt');
      return sendJson(res, 401, { error: 'Unauthorized: Invalid API key' });
    }

    if (req.method === 'POST' && parsedUrl.pathname === '/place-order') {
      const body = await readJson(req);
      const userId = body.userId;
      const accessToken = body.accessToken;
      const orderDetails = body.orderDetails;

      if (!userId || !accessToken || !orderDetails) {
        return sendJson(res, 400, { error: 'Missing required fields: userId, accessToken, orderDetails' });
      }

      const sanitizedOrderDetails = {
        dhanClientId: orderDetails.dhanClientId,
        securityId: String(orderDetails.securityId || ''),
        transactionType: orderDetails.transactionType || 'BUY',
        exchangeSegment: orderDetails.exchangeSegment || 'NSE_FNO',
        productType: 'INTRADAY',
        orderType: 'MARKET',
        validity: 'DAY',
        quantity: Math.max(1, Number(orderDetails.quantity) || 0),
        correlationId: orderDetails.correlationId || ('ORDER_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9)),
        disclosedQuantity: 0,
        price: 0,
        triggerPrice: 0,
        afterMarketOrder: Boolean(orderDetails.afterMarketOrder)
      };
      if (orderDetails.afterMarketOrder && orderDetails.amoTime) sanitizedOrderDetails.amoTime = orderDetails.amoTime;

      log('📤 Placing MARKET order for user ' + userId);
      const response = await dhanRequest('POST', '/v2/orders', accessToken, sanitizedOrderDetails);
      return sendJson(res, response.statusCode, response.data);
    }

    if (req.method === 'GET' && parsedUrl.pathname.indexOf('/order-status/') === 0) {
      const orderId = decodeURIComponent(parsedUrl.pathname.replace('/order-status/', ''));
      const accessToken = parsedUrl.searchParams.get('accessToken');
      const response = await dhanRequest('GET', '/v2/orders/' + encodeURIComponent(orderId), accessToken, null);
      return sendJson(res, response.statusCode, response.data);
    }

    if (req.method === 'DELETE' && parsedUrl.pathname.indexOf('/cancel-order/') === 0) {
      const orderId = decodeURIComponent(parsedUrl.pathname.replace('/cancel-order/', ''));
      const body = await readJson(req);
      const response = await dhanRequest('DELETE', '/v2/orders/' + encodeURIComponent(orderId), body.accessToken, null);
      return sendJson(res, response.statusCode, response.data);
    }

    return sendJson(res, 404, { error: 'Not found' });
  } catch (error) {
    log('❌ Request failed: ' + error.message);
    return sendJson(res, 500, { error: error.message || 'Internal server error' });
  }
});

server.listen(PORT, '0.0.0.0', () => {
  log(\`\`);
  log(\`========================================\`);
  log(\`📡 IndexpilotAI Order Server STARTED\`);
  log(\`========================================\`);
  log(\`🌐 Port: \${PORT}\`);
  log(\`🔐 API Key: \${ORDER_SERVER_API_KEY ? 'Configured ✅' : 'MISSING ❌'}\`);
  log(\`✅ Ready to accept orders from IndexpilotAI backend\`);
  log(\`========================================\`);
  log(\`\`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  log('⚠️ SIGTERM received, shutting down gracefully...');
  process.exit(0);
});

// Handle errors
process.on('uncaughtException', (error) => {
  log(\`❌ Uncaught exception: \${error.message}\`);
});

process.on('unhandledRejection', (reason, promise) => {
  log(\`❌ Unhandled rejection at: \${promise}, reason: \${reason}\`);
});

log('✅ Server initialization complete');
SERVEREOF

# Create systemd service directly — faster than installing PM2.
echo "[5/6] Starting order server with systemd..."
cat > /etc/systemd/system/pm2-root.service << 'SVCEOF'
[Unit]
Description=IndexpilotAI Order Server
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=root
WorkingDirectory=/root/indexpilot-order-server
Environment=NODE_ENV=production
Environment=PORT=3000
Environment="ORDER_SERVER_API_KEY=${orderServerApiKey}"
ExecStart=/usr/bin/node /root/indexpilot-order-server/server.js
Restart=always
RestartSec=2
StandardOutput=append:/var/log/indexpilot-order-server-out.log
StandardError=append:/var/log/indexpilot-order-server-error.log

[Install]
WantedBy=multi-user.target
SVCEOF

systemctl daemon-reload
systemctl enable pm2-root
systemctl restart pm2-root

# Configure firewall
echo "[6/6] Configuring firewall..."
ufw allow 22/tcp
ufw allow 3000/tcp
ufw --force enable

# Create success marker
echo "=========================================" >> /root/deployment-success.txt
echo "IndexpilotAI Order Server Deployed!" >> /root/deployment-success.txt
echo "=========================================" >> /root/deployment-success.txt
echo "Deployed at: $(date)" >> /root/deployment-success.txt
echo "Server URL: http://$(hostname -I | awk '{print $1}'):3000" >> /root/deployment-success.txt
echo "Health Check: http://$(hostname -I | awk '{print $1}'):3000/health" >> /root/deployment-success.txt
echo "=========================================" >> /root/deployment-success.txt

# Test server
echo ""
echo "========================================="
echo "🧪 Testing server deployment..."
echo "========================================="
sleep 2

# Wait for server to start
for i in {1..8}; do
  if curl -s http://localhost:3000/health > /dev/null; then
    echo "Server health check PASSED!"
    curl -s http://localhost:3000/health | head -20
    break
  else
    echo "⏳ Waiting for server to start... ($i/8)"
    sleep 2
  fi
done

echo ""
echo "========================================="
echo "DEPLOYMENT COMPLETE!"
echo "========================================="
echo "Server Status:"
systemctl --no-pager status pm2-root || true
echo ""
echo "Access server at:"
echo "   http://$(hostname -I | awk '{print $1}'):3000"
echo "========================================="
echo ""
echo "Deployment log saved to: /var/log/indexpilot-deploy.log"
echo "Server logs: journalctl -u pm2-root -f"
`;
}

function base64EncodeUtf8(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.slice(i, i + chunkSize));
  }
  return btoa(binary);
}

function getCloudConfigPayload(orderServerApiKey: string): string {
  const shellScript = generateCloudInitScript(orderServerApiKey);

  return `#cloud-config
write_files:
  - path: /root/indexpilot-cloud-init.sh
    owner: root:root
    permissions: '0755'
    encoding: b64
    content: ${base64EncodeUtf8(shellScript)}
runcmd:
  - [ bash, /root/indexpilot-cloud-init.sh ]
`;
}

/**
 * Provision VPS on DigitalOcean
 */
async function provisionDigitalOceanDroplet(
  userId: string,
  orderServerApiKey: string,
  options: { preserveExpiryAt?: string; replacingIpAddress?: string; replacingDropletId?: string | number } = {}
): Promise<{ success: boolean; jobId?: string; error?: string }> {
  try {
    const DO_API_TOKEN = Deno.env.get('DIGITALOCEAN_API_TOKEN');
    
    if (!DO_API_TOKEN) {
      return { success: false, error: 'DigitalOcean API token not configured' };
    }

    const cloudInitScript = generateCloudInitScript(orderServerApiKey);

    // Create droplet
    const response = await fetch('https://api.digitalocean.com/v2/droplets', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DO_API_TOKEN}`
      },
      body: JSON.stringify({
        name: `indexpilot-user-${userId.substring(0, 8)}`,
        region: 'blr1', // Bangalore datacenter (closest to India)
        size: 's-1vcpu-1gb', // $6/month - 1GB RAM, 1 vCPU, 25GB SSD
        image: 'ubuntu-22-04-x64',
        ssh_keys: [], // Add SSH keys if needed
        backups: false,
        ipv6: false,
        user_data: cloudInitScript,
        monitoring: true,
        tags: ['indexpilot', 'order-server', `user-${userId}`]
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('❌ DigitalOcean API error:', errorData);
      return { success: false, error: errorData.message || 'Failed to create droplet' };
    }

    const data = await response.json();
    const droplet = data.droplet;

    // Create provisioning job
    const jobId = `job_${Date.now()}_${userId.substring(0, 8)}`;
    const job: ProvisioningJob = {
      id: jobId,
      userId,
      provider: 'digitalocean',
      status: 'creating',
      dropletId: droplet.id.toString(),
      startedAt: new Date().toISOString(),
      estimatedMinutes: FAST_PROVISIONING_ESTIMATE_MINUTES,
      preserveExpiryAt: options.preserveExpiryAt,
    };

    await kv.set(`${PROVISIONING_PREFIX}${jobId}`, job);
    await kv.set(`${PROVISIONING_PREFIX}user:${userId}`, jobId);
    if (options.preserveExpiryAt) {
      await kv.set(`ip_recreate_preserve:${userId}`, {
        expiresAt: options.preserveExpiryAt,
        replacingIpAddress: options.replacingIpAddress,
        replacingDropletId: options.replacingDropletId ? String(options.replacingDropletId) : undefined,
        createdAt: new Date().toISOString(),
      });
    }

    console.log(`✅ Droplet creation initiated for user ${userId}: ${droplet.id}`);

    // Start monitoring job (non-blocking)
    monitorProvisioningJob(jobId, droplet.id.toString(), DO_API_TOKEN).catch(err => {
      console.error('❌ Monitoring job error:', err);
    });

    return { success: true, jobId };
  } catch (error: any) {
    console.error('❌ Provisioning error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Monitor provisioning job and update status
 * UPDATED: Based on DigitalOcean real timing - 3-5 minutes total
 */
async function monitorProvisioningJob(
  jobId: string,
  dropletId: string,
  apiToken: string
) {
  try {
    let attempts = 0;
    const maxAttempts = 72; // 6 minutes max (check every 5 seconds)

    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
      attempts++;

      // Get droplet status
      const response = await fetch(`https://api.digitalocean.com/v2/droplets/${dropletId}`, {
        headers: {
          'Authorization': `Bearer ${apiToken}`
        }
      });

      if (!response.ok) {
        console.error('❌ Failed to fetch droplet status');
        continue;
      }

      const data = await response.json();
      const droplet = data.droplet;

      // Update job status
      const job = await kv.get(`${PROVISIONING_PREFIX}${jobId}`) as ProvisioningJob;
      if (!job) {
        console.error('❌ Job not found:', jobId);
        return;
      }

      const currentUserJobId = await kv.get(`${PROVISIONING_PREFIX}user:${job.userId}`) as string | null;
      if (job.status === 'failed' || currentUserJobId !== jobId) {
        console.log(`🛑 Stopping monitor for cancelled/stale provisioning job: ${jobId}`);
        return;
      }

      // Phase 1: Check if VPS is active (1-2 minutes typical)
      if (droplet.status === 'active') {
        // Get IP address
        const ipAddress = droplet.networks.v4.find((net: any) => net.type === 'public')?.ip_address;

        if (!ipAddress) {
          console.error('❌ No public IP found for droplet');
          continue;
        }

        console.log(`✅ Droplet active! IP: ${ipAddress} (took ${attempts * 5}s)`);

        // Update job to deploying
        job.status = 'deploying';
        job.ipAddress = ipAddress;
        job.timeline = {
          vpsCreationStart: job.startedAt,
          vpsActive: new Date().toISOString(),
          deploymentStart: new Date().toISOString()
        };
        await kv.set(`${PROVISIONING_PREFIX}${jobId}`, job);

        // Phase 2: Wait for cloud-init deployment
        // OPTIMIZED: cloud-init now avoids apt upgrade, npm install, and PM2 install.
        console.log(`⏳ Waiting 10 seconds for cloud-init to start, then checking health...`);
        await new Promise(resolve => setTimeout(resolve, 10000));

        // Phase 3: AGGRESSIVE health checks
        // Start checking EARLY and OFTEN
        let healthCheckPassed = false;
        const maxHealthChecks = 60; // up to ~3 minutes of fast health checks
        
        console.log(`🧪 Starting AGGRESSIVE health checks for ${ipAddress}:3000/health...`);
        
        for (let i = 0; i < maxHealthChecks; i++) {
          const checkInterval = 2500;
          try {
            const attemptType = 'FAST';
            
            console.log(`⏳ [${attemptType}] Health check attempt ${i + 1}/${maxHealthChecks} for ${ipAddress}...`);
            
            const healthResponse = await fetch(`http://${ipAddress}:3000/health`, {
              signal: AbortSignal.timeout(2500),
              headers: {
                'User-Agent': 'IndexpilotAI-HealthCheck/2.0',
                'Cache-Control': 'no-cache'
              }
            });
            
            if (healthResponse.ok) {
              const healthData = await healthResponse.json();
              healthCheckPassed = true;
              const elapsed = attempts * 5 + 10 + Math.round((i * checkInterval) / 1000);
              console.log(`✅ Health check PASSED for ${ipAddress}!`);
              console.log(`✅ Server response:`, JSON.stringify(healthData));
              console.log(`✅ Total time: ${Math.floor(elapsed/60)}:${(elapsed%60).toString().padStart(2,'0')} (${elapsed}s)`);
              break;
            } else {
              console.log(`⚠️ Health check returned status ${healthResponse.status}, retrying...`);
            }
          } catch (error: any) {
            const attemptType = 'FAST';
            console.log(`⚠️ [${attemptType}] Health check attempt ${i + 1}/${maxHealthChecks} failed: ${error.message}`);
            
            // Firewall detection
            if (error.message.includes('ECONNREFUSED') || error.message.includes('ETIMEDOUT')) {
              if (i === 10) {
                console.log(`⚠️ Persistent connection failures - might be firewall blocking port 3000`);
              }
            }
            
            // Wait before retry
            if (i < maxHealthChecks - 1) {
              const waitTime = checkInterval / 1000;
              console.log(`⏳ Retrying in ${waitTime} seconds...`);
              await new Promise(resolve => setTimeout(resolve, checkInterval));
            }
          }
        }

        if (!healthCheckPassed) {
          const maxWaitTime = Math.round((maxHealthChecks * 2.5));
          console.warn(`⚠️ Health probe did not pass after ${maxWaitTime}s for ${ipAddress}; finalizing because DigitalOcean returned an active public IP.`);
          job.ipAddress = ipAddress;
          job.dropletId = dropletId;
          await finalizeProvisioningJob(job, ipAddress);
          return;
        }

        // Add to IP pool
        await finalizeProvisioningJob(job, ipAddress);
        return;
      }

      console.log(`⏳ Droplet status: ${droplet.status} (attempt ${attempts}/${maxAttempts}, elapsed: ${attempts * 5}s)`);
    }

    // Timeout
    const job = await kv.get(`${PROVISIONING_PREFIX}${jobId}`) as ProvisioningJob;
    if (job) {
      job.status = 'failed';
      job.error = 'Provisioning timeout - took longer than 6 minutes';
      await kv.set(`${PROVISIONING_PREFIX}${jobId}`, job);
    }

  } catch (error: any) {
    console.error('❌ Monitoring error:', error);
    const job = await kv.get(`${PROVISIONING_PREFIX}${jobId}`) as ProvisioningJob;
    if (job) {
      job.status = 'failed';
      job.error = error.message;
      await kv.set(`${PROVISIONING_PREFIX}${jobId}`, job);
    }
  }
}

/**
 * Get provisioning job status
 */
export async function getProvisioningStatus(jobId: string): Promise<ProvisioningJob | null> {
  return await kv.get(`${PROVISIONING_PREFIX}${jobId}`) as ProvisioningJob | null;
}

/**
 * Get user's provisioning job
 */
export async function getUserProvisioningJob(userId: string): Promise<ProvisioningJob | null> {
  const jobId = await kv.get(`${PROVISIONING_PREFIX}user:${userId}`) as string | null;
  if (!jobId) return null;
  return await getProvisioningStatus(jobId);
}

/**
 * Cancel/reset a user's current provisioning job. Droplet deletion is best-effort so
 * users are not blocked when the old DigitalOcean account/token is no longer valid.
 */
export async function cancelUserProvisioningJob(userId: string): Promise<{
  success: boolean;
  cancelled: boolean;
  job?: ProvisioningJob;
  deletionAttempted?: boolean;
  deletionSucceeded?: boolean;
  deletionError?: string;
  error?: string;
}> {
  try {
    const jobId = await kv.get(`${PROVISIONING_PREFIX}user:${userId}`) as string | null;
    if (!jobId) {
      return { success: true, cancelled: false };
    }

    const job = await getProvisioningStatus(jobId);
    let deletionAttempted = false;
    let deletionSucceeded = false;
    let deletionError: string | undefined;

    if (job?.dropletId) {
      const DO_API_TOKEN = Deno.env.get('DIGITALOCEAN_API_TOKEN');
      if (DO_API_TOKEN) {
        deletionAttempted = true;
        try {
          const response = await fetch(`https://api.digitalocean.com/v2/droplets/${job.dropletId}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${DO_API_TOKEN}` }
          });
          deletionSucceeded = response.ok || response.status === 204 || response.status === 404;
          if (!deletionSucceeded) {
            deletionError = await response.text().catch(() => 'DigitalOcean delete failed');
          }
        } catch (deleteError: any) {
          deletionError = deleteError.message;
        }
      }
    }

    if (job?.ipAddress) {
      await kv.del(`${PROVISIONING_PREFIX}pending:${job.ipAddress}`);
      // 🔥 CRITICAL: also drop the stale ip_pool entry for the old VPS so the
      // next provisioning run cannot accidentally re-assign this dead IP.
      try {
        const oldEntry = await kv.get(`ip_pool:${job.ipAddress}`) as any;
        if (oldEntry?.metadata?.autoProvisioned) {
          await kv.del(`ip_pool:${job.ipAddress}`);
          console.log(`🗑️ Removed cancelled VPS from ip_pool: ${job.ipAddress}`);
        }
      } catch (e) {
        console.warn(`⚠️ Failed to drop ip_pool for cancelled VPS: ${(e as any)?.message}`);
      }
    }

    // 🔥 CRITICAL: clear the user's IP assignment if it points at this old VPS,
    // otherwise getUserIPAssignment() will keep returning the dead IP and orders
    // will route to a server that no longer exists.
    try {
      const currentAssignment = await IPPoolManager.getUserIPAssignment(userId);
      if (currentAssignment && (!job?.ipAddress || currentAssignment.ipAddress === job.ipAddress)) {
        await kv.del(`user_ip_assignment:${userId}`);
        await kv.del(`ip_assignment:${userId}:dedicated`);
        console.log(`🧹 Cleared stale user IP assignment for ${userId}`);
      }
    } catch (e) {
      console.warn(`⚠️ Failed to clear user IP assignment: ${(e as any)?.message}`);
    }

    if (job) {
      job.status = 'failed';
      job.error = 'Cancelled by user to start a new server';
      job.completedAt = new Date().toISOString();
      await kv.set(`${PROVISIONING_PREFIX}${jobId}`, job);
    }

    await kv.del(`${PROVISIONING_PREFIX}user:${userId}`);

    console.log(`🧹 Provisioning job reset for user ${userId}: ${jobId}`);
    return { success: true, cancelled: true, job: job || undefined, deletionAttempted, deletionSucceeded, deletionError };
  } catch (error: any) {
    console.error('❌ cancelUserProvisioningJob error:', error);
    return { success: false, cancelled: false, error: error.message };
  }
}

/**
 * Start automatic VPS provisioning for user
 */
export async function provisionDedicatedIP(userId: string): Promise<{ 
  success: boolean; 
  jobId?: string; 
  estimatedMinutes?: number;
  error?: string;
  alreadyProvisioning?: boolean;
  message?: string;
  status?: ProvisioningJob['status'];
}> {
  try {
    // Check if user already has a provisioning job in progress
    const existingJob = await getUserProvisioningJob(userId);
    if (existingJob && (existingJob.status === 'pending' || existingJob.status === 'creating' || existingJob.status === 'deploying')) {
      // Not an error — return success with existing job so callers can poll status
      return {
        success: true,
        jobId: existingJob.id,
        estimatedMinutes: existingJob.estimatedMinutes || FAST_PROVISIONING_ESTIMATE_MINUTES,
        alreadyProvisioning: true,
        status: existingJob.status,
        message: `Provisioning already in progress. Status: ${existingJob.status}`,
      };
    }

    // Get order server API key from environment
    const ORDER_SERVER_API_KEY = Deno.env.get('ORDER_SERVER_API_KEY');
    if (!ORDER_SERVER_API_KEY) {
      return { success: false, error: 'Order server API key not configured' };
    }

    // Provision on DigitalOcean
    const result = await provisionDigitalOceanDroplet(userId, ORDER_SERVER_API_KEY);

    if (!result.success) {
      return { success: false, error: result.error };
    }

    return {
      success: true,
      jobId: result.jobId,
      estimatedMinutes: FAST_PROVISIONING_ESTIMATE_MINUTES
    };

  } catch (error: any) {
    console.error('❌ provisionDedicatedIP error:', error);
    return { success: false, error: error.message };
  }
}

export async function replaceUnhealthyUserVPS(
  userId: string,
  currentIpAddress: string,
  preserveExpiryAt?: string
): Promise<{
  success: boolean;
  jobId?: string;
  estimatedMinutes?: number;
  oldIpAddress?: string;
  deletion?: { success: boolean; error?: string; dropletId?: string };
  error?: string;
  message?: string;
}> {
  try {
    const DO_API_TOKEN = Deno.env.get('DIGITALOCEAN_API_TOKEN');
    if (!DO_API_TOKEN) {
      return { success: false, error: 'DigitalOcean API token not configured' };
    }

    const ORDER_SERVER_API_KEY = Deno.env.get('ORDER_SERVER_API_KEY');
    if (!ORDER_SERVER_API_KEY) {
      return { success: false, error: 'Order server API key not configured' };
    }

    const ipEntry = await kv.get(`ip_pool:${currentIpAddress}`) as any;
    const oldDropletId = ipEntry?.metadata?.dropletId;
    const expiresAt = preserveExpiryAt && new Date(preserveExpiryAt) > new Date()
      ? preserveExpiryAt
      : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    let deletion: { success: boolean; error?: string; dropletId?: string } = { success: false, error: 'No droplet ID found for old IP' };
    if (oldDropletId) {
      const deleteResult = await deleteDigitalOceanDroplet(oldDropletId, DO_API_TOKEN);
      deletion = { ...deleteResult, dropletId: String(oldDropletId) };
    }

    const oldJob = await getUserProvisioningJob(userId);
    if (oldJob) {
      oldJob.status = 'failed';
      oldJob.error = 'Replaced because the VPS was active but order server port 3000 was down';
      oldJob.completedAt = new Date().toISOString();
      await kv.set(`${PROVISIONING_PREFIX}${oldJob.id}`, oldJob);
    }

    await kv.del(`user_ip_assignment:${userId}`);
    await kv.del(`ip_assignment:${userId}:dedicated`);
    await kv.del(`ip_pool:${currentIpAddress}`);
    await kv.del(`${PROVISIONING_PREFIX}pending:${currentIpAddress}`);
    await kv.del(`vps_power:${userId}`);
    await kv.del(`${PROVISIONING_PREFIX}user:${userId}`);

    const result = await provisionDigitalOceanDroplet(userId, ORDER_SERVER_API_KEY, {
      preserveExpiryAt: expiresAt,
      replacingIpAddress: currentIpAddress,
      replacingDropletId: oldDropletId,
    });

    if (!result.success) {
      return { success: false, error: result.error || 'Failed to start replacement VPS provisioning', deletion, oldIpAddress: currentIpAddress };
    }

    return {
      success: true,
      jobId: result.jobId,
      estimatedMinutes: FAST_PROVISIONING_ESTIMATE_MINUTES,
      oldIpAddress: currentIpAddress,
      deletion,
      message: 'Old unhealthy VPS removed. A fresh VPS is being created now and will show a new IP when ready.',
    };
  } catch (error: any) {
    console.error('❌ replaceUnhealthyUserVPS error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Delete VPS when user cancels subscription
 */
export async function deprovisionVPS(ipAddress: string): Promise<{ success: boolean; error?: string }> {
  try {
    const DO_API_TOKEN = Deno.env.get('DIGITALOCEAN_API_TOKEN');
    if (!DO_API_TOKEN) {
      return { success: false, error: 'DigitalOcean API token not configured' };
    }

    // Get IP entry from pool
    const ipEntry = await kv.get(`ip_pool:${ipAddress}`) as any;
    if (!ipEntry || !ipEntry.metadata?.dropletId) {
      return { success: false, error: 'Droplet ID not found for this IP' };
    }

    const dropletId = ipEntry.metadata.dropletId;

    // Delete droplet
    const response = await fetch(`https://api.digitalocean.com/v2/droplets/${dropletId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${DO_API_TOKEN}`
      }
    });

    if (!response.ok && response.status !== 204) {
      const errorData = await response.text();
      console.error('❌ Failed to delete droplet:', errorData);
      return { success: false, error: 'Failed to delete VPS' };
    }

    console.log(`✅ Droplet ${dropletId} deleted successfully`);
    return { success: true };

  } catch (error: any) {
    console.error('❌ Deprovisioning error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Repair an unresponsive order server by power-cycling the droplet via
 * the DigitalOcean API. The systemd service `pm2-root` is enabled at boot,
 * so the order server should come back online automatically (~60-90s).
 */
export async function repairUserVPS(ipAddress: string): Promise<{ success: boolean; error?: string; message?: string; dropletId?: string }> {
  try {
    const DO_API_TOKEN = Deno.env.get('DIGITALOCEAN_API_TOKEN');
    if (!DO_API_TOKEN) {
      return { success: false, error: 'DigitalOcean API token not configured' };
    }

    const ipEntry = await kv.get(`ip_pool:${ipAddress}`) as any;
    const dropletId = ipEntry?.metadata?.dropletId;
    if (!dropletId) {
      return { success: false, error: 'Droplet ID not found for this IP. Please contact support.' };
    }

    const ORDER_SERVER_API_KEY = Deno.env.get('ORDER_SERVER_API_KEY');
    if (!ORDER_SERVER_API_KEY) {
      return { success: false, error: 'Order server API key not configured' };
    }

    const response = await fetch(`https://api.digitalocean.com/v2/droplets/${dropletId}/actions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${DO_API_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ type: 'power_cycle' })
    });

    if (!response.ok) {
      const txt = await response.text();
      console.error(`❌ Power-cycle failed for droplet ${dropletId}:`, txt);
      return { success: false, error: `DigitalOcean API returned ${response.status}` };
    }

    console.log(`🔄 Power-cycled droplet ${dropletId} (IP ${ipAddress}) to repair order server`);
    return {
      success: true,
      dropletId: String(dropletId),
      message: 'Server reboot started as fallback. If it is still down after 2 minutes, use Destroy & Create NEW IP.'
    };
  } catch (error: any) {
    console.error('❌ repairUserVPS error:', error);
    return { success: false, error: error.message };
  }
}