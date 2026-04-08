/**
 * 🏥 VPS Health Check & Diagnostic Tool
 * 
 * Use this to check if VPS server is deployed and running correctly
 */

/**
 * Check if VPS order server is running
 */
export async function checkVPSHealth(ipAddress: string): Promise<{
  success: boolean;
  status: 'healthy' | 'unhealthy' | 'unreachable';
  serverData?: any;
  error?: string;
  fix?: any;
}> {
  try {
    console.log(`🔍 Checking health of VPS: ${ipAddress}`);

    const healthResponse = await fetch(`http://${ipAddress}:3000/health`, {
      signal: AbortSignal.timeout(5000)
    });

    if (healthResponse.ok) {
      const data = await healthResponse.json();
      console.log(`✅ VPS ${ipAddress} is healthy:`, data);
      
      return {
        success: true,
        status: 'healthy',
        serverData: data
      };
    } else {
      console.log(`⚠️ VPS ${ipAddress} responded but unhealthy: ${healthResponse.status}`);
      
      return {
        success: false,
        status: 'unhealthy',
        error: `HTTP ${healthResponse.status}`,
        fix: {
          step1: `SSH into VPS: ssh root@${ipAddress}`,
          step2: 'Check server status: pm2 status',
          step3: 'Check logs: pm2 logs indexpilot-order-server',
          step4: 'Restart server: pm2 restart indexpilot-order-server'
        }
      };
    }

  } catch (error: any) {
    console.error(`❌ Cannot reach VPS ${ipAddress}:`, error.message);
    
    return {
      success: false,
      status: 'unreachable',
      error: error.message,
      fix: {
        problem: 'Server is not responding - likely not deployed',
        solution: 'Deploy order server manually',
        steps: [
          `1. SSH into VPS: ssh root@${ipAddress}`,
          '2. Check if server directory exists: ls -la /root/indexpilot-order-server',
          '3. If not exists, server was never deployed',
          '4. Check cloud-init logs: tail -100 /var/log/cloud-init-output.log',
          '5. Manual deployment: Use /MANUAL_DEPLOY_VPS.sh script'
        ],
        manualDeploy: {
          step1: 'Copy /MANUAL_DEPLOY_VPS.sh script content',
          step2: `SSH: ssh root@${ipAddress}`,
          step3: 'Paste script and run it',
          step4: 'Script will install Node.js + deploy server',
          step5: 'Wait 2-3 minutes for completion'
        }
      }
    };
  }
}

/**
 * Test order placement through VPS
 */
export async function testVPSOrderPlacement(
  ipAddress: string,
  apiKey: string,
  testData: {
    userId: string;
    accessToken: string;
    orderDetails: any;
  }
): Promise<{ success: boolean; result?: any; error?: string }> {
  try {
    console.log(`🧪 Testing order placement on VPS ${ipAddress}`);

    const response = await fetch(`http://${ipAddress}:3000/place-order`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(testData),
      signal: AbortSignal.timeout(10000)
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error(`❌ Order placement test failed:`, errorData);
      
      return {
        success: false,
        error: errorData
      };
    }

    const result = await response.json();
    console.log(`✅ Order placement test successful:`, result);

    return {
      success: true,
      result
    };

  } catch (error: any) {
    console.error(`❌ Order placement test error:`, error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Get detailed VPS diagnostics
 */
export async function getVPSDiagnostics(ipAddress: string): Promise<any> {
  const health = await checkVPSHealth(ipAddress);
  
  const diagnostics: any = {
    ipAddress,
    timestamp: new Date().toISOString(),
    health
  };

  // Try to get test endpoint
  try {
    const testResponse = await fetch(`http://${ipAddress}:3000/test`, {
      signal: AbortSignal.timeout(3000)
    });
    
    if (testResponse.ok) {
      diagnostics.testEndpoint = await testResponse.json();
    }
  } catch (error) {
    diagnostics.testEndpoint = { error: 'Test endpoint unreachable' };
  }

  return diagnostics;
}
