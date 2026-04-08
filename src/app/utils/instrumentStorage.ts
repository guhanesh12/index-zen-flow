// @ts-nocheck
/**
 * IndexedDB Storage Utility for Instruments
 * Handles large datasets (13,500+ instruments) that exceed localStorage limits
 */

const DB_NAME = 'DhanTradingDB';
const DB_VERSION = 1;
const STORE_NAME = 'instruments';

interface Instrument {
  id: string;
  symbol: string;
  tradingSymbol: string;
  securityId: string;
  exchange: string;
  instrumentType: string;
  expiry: string;
  strike: string;
  optionType: 'CALL' | 'PUT' | '';
  lotSize: number;
  tickSize: number;
  underlyingSymbol: string;
  uploadedAt: string;
  status: 'active' | 'inactive';
}

class InstrumentStorage {
  private dbPromise: Promise<IDBDatabase> | null = null;

  /**
   * Initialize IndexedDB
   */
  private async getDB(): Promise<IDBDatabase> {
    if (this.dbPromise) {
      return this.dbPromise;
    }

    this.dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        console.error('❌ IndexedDB error:', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        console.log('✅ IndexedDB opened successfully');
        resolve(request.result);
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        
        // Create object store if it doesn't exist
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const objectStore = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          objectStore.createIndex('underlyingSymbol', 'underlyingSymbol', { unique: false });
          objectStore.createIndex('tradingSymbol', 'tradingSymbol', { unique: false });
          objectStore.createIndex('expiry', 'expiry', { unique: false });
          console.log('✅ IndexedDB object store created');
        }
      };
    });

    return this.dbPromise;
  }

  /**
   * Save all instruments (replaces existing data)
   */
  async saveInstruments(instruments: Instrument[]): Promise<void> {
    try {
      const db = await this.getDB();
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const objectStore = transaction.objectStore(STORE_NAME);

      // Clear existing data
      await new Promise<void>((resolve, reject) => {
        const clearRequest = objectStore.clear();
        clearRequest.onsuccess = () => resolve();
        clearRequest.onerror = () => reject(clearRequest.error);
      });

      // Add all instruments in batches (faster)
      const batchSize = 500;
      for (let i = 0; i < instruments.length; i += batchSize) {
        const batch = instruments.slice(i, i + batchSize);
        
        await Promise.all(
          batch.map(instrument => 
            new Promise<void>((resolve, reject) => {
              const addRequest = objectStore.add(instrument);
              addRequest.onsuccess = () => resolve();
              addRequest.onerror = () => reject(addRequest.error);
            })
          )
        );

        console.log(`💾 Saved batch ${i / batchSize + 1}/${Math.ceil(instruments.length / batchSize)} (${batch.length} instruments)`);
      }

      await new Promise<void>((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      });

      console.log(`✅ Saved ${instruments.length} instruments to IndexedDB`);
    } catch (error) {
      console.error('❌ Error saving to IndexedDB:', error);
      throw error;
    }
  }

  /**
   * Get all instruments
   */
  async getAllInstruments(): Promise<Instrument[]> {
    try {
      const db = await this.getDB();
      const transaction = db.transaction([STORE_NAME], 'readonly');
      const objectStore = transaction.objectStore(STORE_NAME);

      return new Promise((resolve, reject) => {
        const request = objectStore.getAll();
        
        request.onsuccess = () => {
          const instruments = request.result as Instrument[];
          console.log(`✅ Loaded ${instruments.length} instruments from IndexedDB`);
          resolve(instruments);
        };
        
        request.onerror = () => {
          console.error('❌ Error reading from IndexedDB:', request.error);
          reject(request.error);
        };
      });
    } catch (error) {
      console.error('❌ Error loading from IndexedDB:', error);
      return [];
    }
  }

  /**
   * Get instruments by underlying (NIFTY, BANKNIFTY, SENSEX)
   */
  async getInstrumentsByUnderlying(underlying: string): Promise<Instrument[]> {
    try {
      const db = await this.getDB();
      const transaction = db.transaction([STORE_NAME], 'readonly');
      const objectStore = transaction.objectStore(STORE_NAME);
      const index = objectStore.index('underlyingSymbol');

      return new Promise((resolve, reject) => {
        const request = index.getAll(underlying);
        
        request.onsuccess = () => {
          resolve(request.result as Instrument[]);
        };
        
        request.onerror = () => {
          reject(request.error);
        };
      });
    } catch (error) {
      console.error('❌ Error querying IndexedDB:', error);
      return [];
    }
  }

  /**
   * Clear all instruments
   */
  async clearInstruments(): Promise<void> {
    try {
      const db = await this.getDB();
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const objectStore = transaction.objectStore(STORE_NAME);

      await new Promise<void>((resolve, reject) => {
        const request = objectStore.clear();
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });

      console.log('✅ Cleared all instruments from IndexedDB');
    } catch (error) {
      console.error('❌ Error clearing IndexedDB:', error);
      throw error;
    }
  }

  /**
   * Get count of instruments
   */
  async getCount(): Promise<number> {
    try {
      const db = await this.getDB();
      const transaction = db.transaction([STORE_NAME], 'readonly');
      const objectStore = transaction.objectStore(STORE_NAME);

      return new Promise((resolve, reject) => {
        const request = objectStore.count();
        
        request.onsuccess = () => {
          resolve(request.result);
        };
        
        request.onerror = () => {
          reject(request.error);
        };
      });
    } catch (error) {
      console.error('❌ Error counting in IndexedDB:', error);
      return 0;
    }
  }
}

// Singleton instance
export const instrumentStorage = new InstrumentStorage();
