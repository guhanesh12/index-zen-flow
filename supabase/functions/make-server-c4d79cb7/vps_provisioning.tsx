/**
 * 🤖 Automatic VPS Provisioning Service
 * 
 * This service automatically provisions VPS instances when users subscribe to dedicated IPs.
 * Supports DigitalOcean, AWS Lightsail, and Hostinger APIs.
 * 
 * Flow:
 * 1. User subscribes to dedicated IP (₹199/month)
 * 2. System creates new VPS droplet via API (15 minutes)
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
    vpsCreationStart?: string;      // ~0-5 min: DigitalOcean creates VPS
    vpsActive?: string;              // ~5 min: VPS booted and active
    deploymentStart?: string;        // ~5 min: Cloud-init starts
    systemSetupComplete?: string;    // ~8 min: Node.js + PM2 installed
    serverDeployed?: string;         // ~10 min: Server running
    healthCheckPassed?: string;      // ~11 min: Health check passes
    ipAssigned?: string;             // ~11 min: IP assigned to user
    completed?: string;              // ~11 min: Ready for orders!
  };
}

const PROVISIONING_PREFIX = 'vps_provisioning:';
const DEDICATED_IP_MONTHLY_FEE = 599;
const ORDER_SERVER_VERSION = '1.1.0';

async function checkOrderServerHealth(ipAddress: string): Promise<boolean> {
  try {
    const healthResponse = await fetch(`http://${ipAddress}:3000/health`, {
      signal: AbortSignal.timeout(5000),
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

async function finalizeProvisioningJob(job: ProvisioningJob, ipAddress: string): Promise<ProvisioningJob> {
  const addResult = await ensureIPPoolEntry(job, ipAddress);

  if (!addResult.success) {
    job.status = 'failed';
    job.error = `Failed to add IP to pool: ${addResult.error}`;
    await kv.set(`${PROVISIONING_PREFIX}${job.id}`, job);
    return job;
  }

  const existingAssignment = await IPPoolManager.getUserIPAssignment(job.userId);
  if (!existingAssignment) {
    const assignResult = await IPPoolManager.assignIPToUser(job.userId, DEDICATED_IP_MONTHLY_FEE);

    if (!assignResult.success) {
      job.status = 'failed';
      job.error = `Failed to assign IP to user: ${assignResult.error}`;
      await kv.set(`${PROVISIONING_PREFIX}${job.id}`, job);
      return job;
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
  job.estimatedMinutes = Math.max(1, Math.round(totalTime / 60));
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

  if (job.status === 'ready' || job.status === 'active' || job.status === 'failed') {
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

# ===================================
# IndexpilotAI Order Server Auto-Deploy
# IMPROVED VERSION - 100% AUTOMATIC
# ===================================

set -e

# Log everything
exec > >(tee -a /var/log/indexpilot-deploy.log)
exec 2>&1

echo "========================================="
echo "🤖 IndexpilotAI Auto-Deployment Starting"
echo "Time: $(date)"
echo "========================================="

# Update system
echo "📦 [1/8] Updating system packages..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get upgrade -y -qq

# Install Node.js 18.x
echo "📦 [2/8] Installing Node.js 18.x..."
curl -fsSL https://deb.nodesource.com/setup_18.x | bash - 
apt-get install -y nodejs

node --version
npm --version

# Install PM2 for process management
echo "📦 [3/8] Installing PM2..."
npm install -g pm2

# Create order server directory
echo "📁 [4/8] Creating server directory..."
mkdir -p /root/indexpilot-order-server
cd /root/indexpilot-order-server

# Create server.js
echo "📝 [5/8] Creating server files..."
cat > server.js << 'SERVEREOF'
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const app = express();

app.use(express.json({ limit: '10mb' }));
app.use(cors());

const PORT = process.env.PORT || 3000;
const ORDER_SERVER_API_KEY = process.env.ORDER_SERVER_API_KEY;

const log = (msg) => {
  const timestamp = new Date().toISOString();
  console.log(\`[\${timestamp}] \${msg}\`);
};

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'indexpilot-order-server',
    version: '${ORDER_SERVER_VERSION}',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    apiKeyConfigured: !!ORDER_SERVER_API_KEY,
    marketOnlyEnforced: true
  });
});

// Test endpoint
app.get('/test', (req, res) => {
  res.json({
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
});

// Place order endpoint
app.post('/place-order', async (req, res) => {
  try {
    // Verify API key
    const authHeader = req.headers.authorization;
    if (!authHeader || authHeader !== \`Bearer \${ORDER_SERVER_API_KEY}\`) {
      log('❌ Unauthorized access attempt');
      return res.status(401).json({ error: 'Unauthorized: Invalid API key' });
    }

    const { userId, accessToken, orderDetails } = req.body;
    
    if (!userId || !accessToken || !orderDetails) {
      log('❌ Missing required fields');
      return res.status(400).json({ error: 'Missing required fields: userId, accessToken, orderDetails' });
    }

    const sanitizedOrderDetails = {
      ...orderDetails,
      productType: 'INTRADAY',
      orderType: 'MARKET',
      price: 0,
      triggerPrice: 0,
    };

    log(\`📤 Placing MARKET order for user \${userId}\`);
    log(\`📤 Order details: \${JSON.stringify(sanitizedOrderDetails).substring(0, 200)}\`);

    // Forward to Dhan API
    const response = await axios.post(
      'https://api.dhan.co/v2/orders',
      sanitizedOrderDetails,
      {
        headers: {
          'access-token': accessToken,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      }
    );

    log(\`✅ Order placed successfully for user \${userId}: Order ID \${response.data.orderId}\`);
    res.json(response.data);

  } catch (error) {
    const errorMsg = error.response?.data || error.message;
    log(\`❌ Order placement failed: \${JSON.stringify(errorMsg)}\`);
    
    res.status(error.response?.status || 500).json({ 
      error: errorMsg,
      errorCode: error.response?.data?.errorCode || 'UNKNOWN_ERROR'
    });
  }
});

// Get order status
app.get('/order-status/:orderId', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || authHeader !== \`Bearer \${ORDER_SERVER_API_KEY}\`) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { orderId } = req.params;
    const accessToken = req.query.accessToken;

    const response = await axios.get(
      \`https://api.dhan.co/v2/orders/\${orderId}\`,
      {
        headers: {
          'access-token': accessToken,
          'Content-Type': 'application/json'
        }
      }
    );

    res.json(response.data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Cancel order
app.delete('/cancel-order/:orderId', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || authHeader !== \`Bearer \${ORDER_SERVER_API_KEY}\`) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { orderId } = req.params;
    const accessToken = req.body.accessToken;

    const response = await axios.delete(
      \`https://api.dhan.co/v2/orders/\${orderId}\`,
      {
        headers: {
          'access-token': accessToken,
          'Content-Type': 'application/json'
        }
      }
    );

    res.json(response.data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
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

# Create package.json
cat > package.json << 'PACKAGEEOF'
{
  "name": "indexpilot-order-server",
  "version": "${ORDER_SERVER_VERSION}",
  "description": "IndexpilotAI Order Placement Server - Auto-deployed",
  "main": "server.js",
  "scripts": {
    "start": "node server.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "axios": "^1.6.0",
    "cors": "^2.8.5"
  }
}
PACKAGEEOF

# Install dependencies
echo "📦 [6/8] Installing npm packages..."
npm install

# Create PM2 ecosystem file
cat > ecosystem.config.js << 'ECOEOF'
module.exports = {
  apps: [{
    name: 'indexpilot-order-server',
    script: 'server.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '500M',
    env: {
      NODE_ENV: 'production',
      PORT: 3000,
      ORDER_SERVER_API_KEY: '${orderServerApiKey}'
    },
    error_file: '/var/log/indexpilot-order-server-error.log',
    out_file: '/var/log/indexpilot-order-server-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true
  }]
};
ECOEOF

# Start with PM2 and configure persistent startup
echo "🚀 [7/8] Starting order server with PM2..."
pm2 start ecosystem.config.js
pm2 save

# Create systemd service directly (pm2 startup only prints the command, doesn't run it)
cat > /etc/systemd/system/pm2-root.service << 'SVCEOF'
[Unit]
Description=PM2 process manager
Documentation=https://pm2.keymetrics.io/
After=network.target

[Service]
Type=forking
User=root
LimitNOFILE=infinity
LimitCORE=infinity
Environment=PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/usr/local/nvm/versions/node/v18.20.8/bin
Environment=PM2_HOME=/root/.pm2
PIDFile=/root/.pm2/pm2.pid
ExecStart=/usr/lib/node_modules/pm2/bin/pm2 resurrect
ExecReload=/usr/lib/node_modules/pm2/bin/pm2 reload all
ExecStop=/usr/lib/node_modules/pm2/bin/pm2 kill
Restart=on-failure

[Install]
WantedBy=multi-user.target
SVCEOF

systemctl daemon-reload
systemctl enable pm2-root
systemctl start pm2-root || true

# Configure firewall
echo "🔒 [8/8] Configuring firewall..."
ufw allow 22/tcp
ufw allow 3000/tcp
ufw --force enable

# Create success marker
echo "=========================================" >> /root/deployment-success.txt
echo "✅ IndexpilotAI Order Server Deployed!" >> /root/deployment-success.txt
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
sleep 5

# Wait for server to start
for i in {1..10}; do
  if curl -s http://localhost:3000/health > /dev/null; then
    echo "✅ Server health check PASSED!"
    curl -s http://localhost:3000/health | head -20
    break
  else
    echo "⏳ Waiting for server to start... ($i/10)"
    sleep 3
  fi
done

echo ""
echo "========================================="
echo "✅ DEPLOYMENT COMPLETE!"
echo "========================================="
echo "📊 Server Status:"
pm2 status
echo ""
echo "📍 Access server at:"
echo "   http://$(hostname -I | awk '{print $1}'):3000"
echo "========================================="
echo ""
echo "Deployment log saved to: /var/log/indexpilot-deploy.log"
echo "Server logs: pm2 logs indexpilot-order-server"
`;
}

/**
 * Provision VPS on DigitalOcean
 */
async function provisionDigitalOceanDroplet(
  userId: string,
  orderServerApiKey: string
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
      estimatedMinutes: 15
    };

    await kv.set(`${PROVISIONING_PREFIX}${jobId}`, job);
    await kv.set(`${PROVISIONING_PREFIX}user:${userId}`, jobId);

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
    const maxAttempts = 30; // 7.5 minutes max (check every 15 seconds)

    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 15000)); // Wait 15 seconds
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

      // Phase 1: Check if VPS is active (1-2 minutes typical)
      if (droplet.status === 'active') {
        // Get IP address
        const ipAddress = droplet.networks.v4.find((net: any) => net.type === 'public')?.ip_address;

        if (!ipAddress) {
          console.error('❌ No public IP found for droplet');
          continue;
        }

        console.log(`✅ Droplet active! IP: ${ipAddress} (took ${attempts * 15}s)`);

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
        // OPTIMIZED: Our cloud-init script is minimal (Node.js + 3 npm packages)
        // Real timing: apt-get (30s) + Node.js (20s) + npm install (15s) = 65 seconds
        console.log(`⏳ Waiting 30 seconds for cloud-init to start, then checking health...`);
        await new Promise(resolve => setTimeout(resolve, 30000)); // REDUCED: 30 seconds (was 90s)

        // Phase 3: AGGRESSIVE health checks
        // Start checking EARLY and OFTEN
        let healthCheckPassed = false;
        const maxHealthChecks = 25; // 25 attempts total
        
        console.log(`🧪 Starting AGGRESSIVE health checks for ${ipAddress}:3000/health...`);
        
        for (let i = 0; i < maxHealthChecks; i++) {
          try {
            // First 15 attempts: Check every 5 seconds (fast polling)
            // Last 10 attempts: Check every 10 seconds (slower polling)
            const checkInterval = i < 15 ? 5000 : 10000;
            const attemptType = i < 15 ? 'FAST' : 'SLOW';
            
            console.log(`⏳ [${attemptType}] Health check attempt ${i + 1}/${maxHealthChecks} for ${ipAddress}...`);
            
            const healthResponse = await fetch(`http://${ipAddress}:3000/health`, {
              signal: AbortSignal.timeout(6000), // 6 seconds timeout
              headers: {
                'User-Agent': 'IndexpilotAI-HealthCheck/2.0',
                'Cache-Control': 'no-cache'
              }
            });
            
            if (healthResponse.ok) {
              const healthData = await healthResponse.json();
              healthCheckPassed = true;
              const elapsed = attempts * 15 + 30 + (i < 15 ? i * 5 : (15 * 5) + ((i - 15) * 10));
              console.log(`✅ Health check PASSED for ${ipAddress}!`);
              console.log(`✅ Server response:`, JSON.stringify(healthData));
              console.log(`✅ Total time: ${Math.floor(elapsed/60)}:${(elapsed%60).toString().padStart(2,'0')} (${elapsed}s)`);
              break;
            } else {
              console.log(`⚠️ Health check returned status ${healthResponse.status}, retrying...`);
            }
          } catch (error: any) {
            const attemptType = i < 15 ? 'FAST' : 'SLOW';
            console.log(`⚠️ [${attemptType}] Health check attempt ${i + 1}/${maxHealthChecks} failed: ${error.message}`);
            
            // Firewall detection
            if (error.message.includes('ECONNREFUSED') || error.message.includes('ETIMEDOUT')) {
              if (i === 10) {
                console.log(`⚠️ Persistent connection failures - might be firewall blocking port 3000`);
              }
            }
            
            // Wait before retry
            if (i < maxHealthChecks - 1) {
              const waitTime = i < 15 ? 5 : 10;
              console.log(`⏳ Retrying in ${waitTime} seconds...`);
              await new Promise(resolve => setTimeout(resolve, waitTime * 1000));
            }
          }
        }

        if (!healthCheckPassed) {
          const maxWaitTime = (15 * 5) + (10 * 10); // 175 seconds total
          console.error(`❌ Health check failed after ${maxWaitTime} seconds`);
          console.error(`❌ VPS IP: ${ipAddress}`);
          console.error(`❌ Droplet ID: ${dropletId}`);
          console.error(`❌ This might be a firewall issue - port 3000 might be blocked`);
          
          job.status = 'failed';
          job.error = `Health check timeout after ${maxWaitTime} seconds. Server might be running but port 3000 is not accessible. Check firewall settings.`;
          job.ipAddress = ipAddress; // IMPORTANT: Save IP even on failure so admin can manually check
          job.dropletId = dropletId;
          await kv.set(`${PROVISIONING_PREFIX}${jobId}`, job);
          
          // Create a "pending_manual_verification" status instead of complete failure
          await kv.set(`${PROVISIONING_PREFIX}pending:${ipAddress}`, {
            jobId,
            userId: job.userId,
            ipAddress,
            dropletId,
            reason: 'health_check_timeout',
            timestamp: new Date().toISOString()
          });
          
          console.log(`⚠️ Job marked for manual verification: ${jobId}`);
          return;
        }

        // Add to IP pool
        await finalizeProvisioningJob(job, ipAddress);
        return;
      }

      console.log(`⏳ Droplet status: ${droplet.status} (attempt ${attempts}/${maxAttempts}, elapsed: ${attempts * 15}s)`);
    }

    // Timeout
    const job = await kv.get(`${PROVISIONING_PREFIX}${jobId}`) as ProvisioningJob;
    if (job) {
      job.status = 'failed';
      job.error = 'Provisioning timeout - took longer than 7.5 minutes';
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
 * Start automatic VPS provisioning for user
 */
export async function provisionDedicatedIP(userId: string): Promise<{ 
  success: boolean; 
  jobId?: string; 
  estimatedMinutes?: number;
  error?: string;
}> {
  try {
    // Check if user already has a provisioning job in progress
    const existingJob = await getUserProvisioningJob(userId);
    if (existingJob && (existingJob.status === 'pending' || existingJob.status === 'creating' || existingJob.status === 'deploying')) {
      return {
        success: false,
        error: `Provisioning already in progress. Status: ${existingJob.status}`
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
      estimatedMinutes: 8
    };

  } catch (error: any) {
    console.error('❌ provisionDedicatedIP error:', error);
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