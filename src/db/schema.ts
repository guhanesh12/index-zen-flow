// src/db/schema.ts
import { boolean, integer, jsonb, numeric, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';

// Users table linked to Firebase Auth UID
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(), // Firebase Auth UID
  email: text('email').notNull(),
  displayName: text('display_name'),
  photoUrl: text('photo_url'),
  role: text('role').default('user'),
  pinHash: text('pin_hash'),
  isLocked: boolean('is_locked').default(false),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// User Symbol Slots (Auto Symbol ATM / ITM / OTM Configuration)
export const userSymbolConfig = pgTable('user_symbol_config', {
  id: serial('id').primaryKey(),
  userId: text('user_id').notNull(),
  slot: integer('slot').notNull(),
  indexName: text('index_name').notNull().default('NIFTY'),
  moneyness: text('moneyness').notNull().default('ATM'),
  lotCount: integer('lot_count').notNull().default(1),
  enabled: boolean('enabled').notNull().default(true),
  targetPerLot: numeric('target_per_lot').notNull().default('6000'),
  stopLossPerLot: numeric('stop_loss_per_lot').notNull().default('3000'),
  trailingEnabled: boolean('trailing_enabled').notNull().default(true),
  trailingActivationPerLot: numeric('trailing_activation_per_lot').notNull().default('4000'),
  trailingStepPerLot: numeric('trailing_step_per_lot').notNull().default('1000'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// User Quotas (Max Slots, Extra Slots)
export const userQuotas = pgTable('user_quotas', {
  id: serial('id').primaryKey(),
  userId: text('user_id').notNull().unique(),
  maxSlots: integer('max_slots').notNull().default(3),
  extraSlots: integer('extra_slots').notNull().default(0),
  slotPrice: numeric('slot_price').notNull().default('49'),
  hardCap: integer('hard_cap').notNull().default(20),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Trading Orders (History & Live orders)
export const tradingOrders = pgTable('trading_orders', {
  id: serial('id').primaryKey(),
  userId: text('user_id').notNull(),
  orderId: text('order_id').notNull(),
  symbol: text('symbol').notNull(),
  indexName: text('index_name'),
  orderType: text('order_type').notNull(),
  transactionType: text('transaction_type').notNull(),
  quantity: integer('quantity').notNull(),
  price: numeric('price').notNull().default('0'),
  status: text('status').notNull().default('PENDING'),
  broker: text('broker').default('DHAN'),
  errorMessage: text('error_message'),
  dhanOrderId: text('dhan_order_id'),
  rawData: jsonb('raw_data'),
  createdAt: timestamp('created_at').defaultNow(),
});

// Trading Signals
export const tradingSignals = pgTable('trading_signals', {
  id: serial('id').primaryKey(),
  symbol: text('symbol').notNull(),
  signalType: text('signal_type').notNull(),
  indexName: text('index_name'),
  price: numeric('price').notNull(),
  strikePrice: numeric('strike_price'),
  optionType: text('option_type'),
  confidence: numeric('confidence'),
  status: text('status').default('ACTIVE'),
  rawData: jsonb('raw_data'),
  createdAt: timestamp('created_at').defaultNow(),
});

// Position Monitor State (Trailing Stop Guardian)
export const positionMonitorState = pgTable('position_monitor_state', {
  id: serial('id').primaryKey(),
  userId: text('user_id').notNull(),
  orderId: text('order_id').notNull(),
  symbol: text('symbol').notNull(),
  indexName: text('index_name'),
  entryPrice: numeric('entry_price').notNull(),
  currentPrice: numeric('current_price').notNull(),
  quantity: integer('quantity').notNull(),
  pnl: numeric('pnl').default('0'),
  targetAmount: numeric('target_amount'),
  stopLossAmount: numeric('stop_loss_amount'),
  trailingEnabled: boolean('trailing_enabled').default(false),
  highestPnl: numeric('highest_pnl').default('0'),
  isActive: boolean('is_active').default(true),
  exitReason: text('exit_reason'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Broker Credentials
export const brokerCredentials = pgTable('broker_credentials', {
  id: serial('id').primaryKey(),
  userId: text('user_id').notNull(),
  brokerName: text('broker_name').notNull(), // DHAN, ZERODHA, FYERS, UPSTOX, GROWW
  clientId: text('client_id'),
  accessToken: text('access_token'),
  apiKey: text('api_key'),
  apiSecret: text('api_secret'),
  pin: text('pin'),
  totpSecret: text('totp_secret'),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Wallets and Ledger
export const wallets = pgTable('wallets', {
  id: serial('id').primaryKey(),
  userId: text('user_id').notNull().unique(),
  balance: numeric('balance').notNull().default('0'),
  currency: text('currency').notNull().default('INR'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const walletTransactions = pgTable('wallet_transactions', {
  id: serial('id').primaryKey(),
  userId: text('user_id').notNull(),
  amount: numeric('amount').notNull(),
  type: text('type').notNull(), // CREDIT, DEBIT
  description: text('description'),
  referenceId: text('reference_id'),
  createdAt: timestamp('created_at').defaultNow(),
});
