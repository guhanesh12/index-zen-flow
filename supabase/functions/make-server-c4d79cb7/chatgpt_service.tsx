// ChatGPT AI Strategy Service

export class ChatGPTService {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async testConnection(): Promise<boolean> {
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          model: 'gpt-4',
          messages: [{ role: 'user', content: 'Test connection - respond with OK' }],
          max_tokens: 10
        })
      });

      return response.ok;
    } catch (error) {
      console.log(`ChatGPT connection test failed: ${error}`);
      return false;
    }
  }

  async analyzeMarket(params: any): Promise<any> {
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          model: 'gpt-4',
          messages: [
            {
              role: 'system',
              content: 'You are an expert options trading strategist. Always respond with valid JSON only, no markdown formatting.'
            },
            {
              role: 'user',
              content: params
            }
          ],
          temperature: 0.3,
          max_tokens: 500
        })
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`ChatGPT API Error: ${error}`);
      }

      const data = await response.json();
      const content = data.choices[0]?.message?.content || '';

      // Remove markdown code blocks if present
      let cleanContent = content.trim();
      if (cleanContent.startsWith('```json')) {
        cleanContent = cleanContent.replace(/```json\n?/g, '').replace(/```\n?$/g, '');
      } else if (cleanContent.startsWith('```')) {
        cleanContent = cleanContent.replace(/```\n?/g, '').replace(/```\n?$/g, '');
      }

      const analysis = JSON.parse(cleanContent);

      return {
        market_state: analysis.market_state || 'Range',
        bias: analysis.bias || 'Neutral',
        action: analysis.action || 'WAIT',
        confidence: Math.min(100, Math.max(0, analysis.confidence || 50)),
        option_risk_note: analysis.option_risk_note || '',
        raw_response: content
      };
    } catch (error: any) {
      console.error('ChatGPT analysis error:', error);
      
      // Return conservative default if AI fails
      return {
        market_state: 'Range',
        bias: 'Neutral',
        action: 'WAIT',
        confidence: 0,
        option_risk_note: `AI Analysis Error: ${error.message}`,
        raw_response: error.message
      };
    }
  }
}