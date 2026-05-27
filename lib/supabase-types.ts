// Hand-written DB types covering:
//  - tablas existentes en martinez-global (products, combos, combo_items,
//    categories, stores) — solo las que necesitamos consultar aquí
//  - tablas nuevas creadas por supabase/migrations/0005_erp_inventory.sql
//
// Si alguna vez cambia el esquema en cualquiera de los dos repos, actualizar
// este archivo (o autogenerar con `supabase gen types typescript`).

export type WarehouseType =
  | "almacen_central"
  | "tienda_fisica"
  | "tienda_online"
  | "centro_elaboracion";

export type InventoryMovementType =
  | "entrada"
  | "salida"
  | "transferencia"
  | "ajuste"
  | "merma";

export type PurchaseOrderStatus = "borrador" | "recibida" | "cancelada";
export type OrderOrigin = "online" | "pos" | "whatsapp" | "otro";
export type OrderStatus = "borrador" | "confirmada" | "cancelada";
export type PaymentMethod = "efectivo" | "transferencia" | "tarjeta" | "mixto" | "otro";
export type PayrollStatus = "borrador" | "cerrada";
export type ProductionStatus = "borrador" | "producida" | "cancelada";
export type RemittanceStatus = "pendiente" | "entregada" | "cancelada";
export type RemittancePayoutMethod = "efectivo" | "tarjeta_cup" | "transferencia" | "otro";
export type AccountType = "activo" | "pasivo" | "patrimonio" | "ingreso" | "gasto";
export type JournalEntryStatus = "borrador" | "contabilizada";

export type Database = {
  public: {
    Tables: {
      // ── existentes (martinez-global) ────────────────────────────────────
      stores: {
        Row: {
          id: string;
          slug: string;
          label: string;
          short_label: string;
          primary_color: string;
          accent_color: string;
          position: number;
          active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      categories: {
        Row: {
          id: string;
          name: string;
          position: number;
          store: string;
          created_at: string;
          updated_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      products: {
        Row: {
          id: string;
          name: string;
          description: string;
          price: number;
          old_price: number | null;
          image: string;
          stock: number;
          category: string;
          store: string;
          shipping_time: string | null;
          featured: boolean;
          is_new: boolean;
          online_visible: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          name: string;
          description?: string;
          price: number;
          old_price?: number | null;
          image?: string;
          stock?: number;
          category: string;
          store: string;
          shipping_time?: string | null;
          featured?: boolean;
          is_new?: boolean;
          online_visible?: boolean;
        };
        Update: {
          name?: string;
          description?: string;
          price?: number;
          old_price?: number | null;
          image?: string;
          stock?: number;
          category?: string;
          store?: string;
          shipping_time?: string | null;
          featured?: boolean;
          is_new?: boolean;
          online_visible?: boolean;
        };
        Relationships: [];
      };

      // ── nuevas (martinez-gestor) ────────────────────────────────────────
      app_users: {
        Row: {
          id: string;
          email: string;
          password_hash: string;
          full_name: string;
          active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          email: string;
          password_hash: string;
          full_name?: string;
          active?: boolean;
        };
        Update: Partial<Database["public"]["Tables"]["app_users"]["Insert"]>;
        Relationships: [];
      };
      roles: {
        Row: {
          id: string;
          name: string;
          description: string;
          created_at: string;
        };
        Insert: { id: string; name: string; description?: string };
        Update: Partial<Database["public"]["Tables"]["roles"]["Insert"]>;
        Relationships: [];
      };
      user_roles: {
        Row: {
          user_id: string;
          role_id: string;
          created_at: string;
        };
        Insert: { user_id: string; role_id: string };
        Update: never;
        Relationships: [];
      };
      warehouses: {
        Row: {
          id: string;
          code: string;
          name: string;
          type: WarehouseType;
          store_slug: string | null;
          address: string;
          active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          code: string;
          name: string;
          type?: WarehouseType;
          store_slug?: string | null;
          address?: string;
          active?: boolean;
        };
        Update: Partial<Database["public"]["Tables"]["warehouses"]["Insert"]>;
        Relationships: [];
      };
      stock_locations: {
        Row: {
          product_id: string;
          warehouse_id: string;
          quantity: number;
          min_stock: number;
          max_stock: number | null;
          updated_at: string;
        };
        Insert: {
          product_id: string;
          warehouse_id: string;
          quantity?: number;
          min_stock?: number;
          max_stock?: number | null;
        };
        Update: Partial<
          Database["public"]["Tables"]["stock_locations"]["Insert"]
        >;
        Relationships: [];
      };
      inventory_movements: {
        Row: {
          id: string;
          type: InventoryMovementType;
          warehouse_from: string | null;
          warehouse_to: string | null;
          reference_type: string;
          reference_id: string | null;
          user_id: string | null;
          notes: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          type: InventoryMovementType;
          warehouse_from?: string | null;
          warehouse_to?: string | null;
          reference_type?: string;
          reference_id?: string | null;
          user_id?: string | null;
          notes?: string;
        };
        Update: never;
        Relationships: [];
      };
      suppliers: {
        Row: {
          id: string;
          name: string;
          contact_name: string;
          phone: string;
          email: string;
          tax_id: string;
          address: string;
          notes: string;
          active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          contact_name?: string;
          phone?: string;
          email?: string;
          tax_id?: string;
          address?: string;
          notes?: string;
          active?: boolean;
        };
        Update: Partial<Database["public"]["Tables"]["suppliers"]["Insert"]>;
        Relationships: [];
      };
      purchase_orders: {
        Row: {
          id: string;
          code: string;
          supplier_id: string;
          warehouse_id: string;
          status: PurchaseOrderStatus;
          reference: string;
          notes: string;
          total_amount: number;
          created_by: string | null;
          received_by: string | null;
          received_at: string | null;
          movement_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          code?: string;
          supplier_id: string;
          warehouse_id: string;
          status?: PurchaseOrderStatus;
          reference?: string;
          notes?: string;
          created_by?: string | null;
        };
        Update: {
          supplier_id?: string;
          warehouse_id?: string;
          status?: PurchaseOrderStatus;
          reference?: string;
          notes?: string;
          received_by?: string | null;
          received_at?: string | null;
          movement_id?: string | null;
        };
        Relationships: [];
      };
      purchase_order_lines: {
        Row: {
          id: string;
          purchase_order_id: string;
          product_id: string;
          quantity: number;
          unit_cost: number;
          line_total: number;
          position: number;
        };
        Insert: {
          id?: string;
          purchase_order_id: string;
          product_id: string;
          quantity: number;
          unit_cost?: number;
          position?: number;
        };
        Update: {
          quantity?: number;
          unit_cost?: number;
          position?: number;
        };
        Relationships: [];
      };
      customers: {
        Row: {
          id: string;
          name: string;
          phone: string;
          email: string;
          address: string;
          notes: string;
          active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          phone?: string;
          email?: string;
          address?: string;
          notes?: string;
          active?: boolean;
        };
        Update: Partial<Database["public"]["Tables"]["customers"]["Insert"]>;
        Relationships: [];
      };
      orders: {
        Row: {
          id: string;
          code: string;
          customer_id: string | null;
          warehouse_id: string;
          origin: OrderOrigin;
          status: OrderStatus;
          payment_method: PaymentMethod;
          reference: string;
          notes: string;
          total_amount: number;
          created_by: string | null;
          confirmed_by: string | null;
          confirmed_at: string | null;
          movement_id: string | null;
          payment_status: string;
          payment_provider: string | null;
          payment_ref: string | null;
          amount_charged: number | null;
          charge_currency: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          code?: string;
          customer_id?: string | null;
          warehouse_id: string;
          origin?: OrderOrigin;
          status?: OrderStatus;
          payment_method?: PaymentMethod;
          reference?: string;
          notes?: string;
          created_by?: string | null;
          payment_status?: string;
          payment_provider?: string | null;
          payment_ref?: string | null;
          amount_charged?: number | null;
          charge_currency?: string | null;
        };
        Update: {
          customer_id?: string | null;
          warehouse_id?: string;
          origin?: OrderOrigin;
          status?: OrderStatus;
          payment_method?: PaymentMethod;
          reference?: string;
          notes?: string;
          confirmed_by?: string | null;
          confirmed_at?: string | null;
          movement_id?: string | null;
          payment_status?: string;
          payment_provider?: string | null;
          payment_ref?: string | null;
          amount_charged?: number | null;
          charge_currency?: string | null;
        };
        Relationships: [];
      };
      online_payments: {
        Row: {
          id: string;
          order_id: string;
          provider: string;
          link_code: string | null;
          oper_code: string | null;
          amount_usd: number;
          nonce: string;
          status: string;
          raw: unknown | null;
          created_at: string;
          paid_at: string | null;
          updated_at: string;
        };
        Insert: {
          id?: string;
          order_id: string;
          provider?: string;
          link_code?: string | null;
          oper_code?: string | null;
          amount_usd: number;
          nonce: string;
          status?: string;
          raw?: unknown | null;
          paid_at?: string | null;
        };
        Update: {
          link_code?: string | null;
          oper_code?: string | null;
          status?: string;
          raw?: unknown | null;
          paid_at?: string | null;
        };
        Relationships: [];
      };
      order_lines: {
        Row: {
          id: string;
          order_id: string;
          product_id: string;
          quantity: number;
          unit_price: number;
          line_total: number;
          position: number;
        };
        Insert: {
          id?: string;
          order_id: string;
          product_id: string;
          quantity: number;
          unit_price?: number;
          position?: number;
        };
        Update: {
          quantity?: number;
          unit_price?: number;
          position?: number;
        };
        Relationships: [];
      };
      positions: {
        Row: {
          id: string; name: string; description: string;
          base_salary: number; active: boolean;
          created_at: string; updated_at: string;
        };
        Insert: { id?: string; name: string; description?: string; base_salary?: number; active?: boolean };
        Update: Partial<Database["public"]["Tables"]["positions"]["Insert"]>;
        Relationships: [];
      };
      employees: {
        Row: {
          id: string; code: string;
          first_name: string; last_name: string;
          document_id: string; phone: string; email: string; address: string;
          hire_date: string | null; termination_date: string | null;
          position_id: string | null; warehouse_id: string | null; app_user_id: string | null;
          monthly_salary: number; active: boolean; notes: string;
          created_at: string; updated_at: string;
        };
        Insert: {
          id?: string; code: string;
          first_name: string; last_name?: string;
          document_id?: string; phone?: string; email?: string; address?: string;
          hire_date?: string | null; termination_date?: string | null;
          position_id?: string | null; warehouse_id?: string | null; app_user_id?: string | null;
          monthly_salary?: number; active?: boolean; notes?: string;
        };
        Update: Partial<Database["public"]["Tables"]["employees"]["Insert"]>;
        Relationships: [];
      };
      attendance: {
        Row: {
          employee_id: string; day: string; present: boolean; hours: number;
          notes: string; recorded_by: string | null; recorded_at: string;
        };
        Insert: {
          employee_id: string; day: string; present?: boolean; hours?: number;
          notes?: string; recorded_by?: string | null;
        };
        Update: { present?: boolean; hours?: number; notes?: string; recorded_by?: string | null };
        Relationships: [];
      };
      payroll_runs: {
        Row: {
          id: string; period_start: string; period_end: string;
          status: PayrollStatus; notes: string;
          created_by: string | null; closed_by: string | null; closed_at: string | null;
          created_at: string; updated_at: string;
        };
        Insert: { id?: string; period_start: string; period_end: string; notes?: string; created_by?: string | null };
        Update: { status?: PayrollStatus; notes?: string; closed_by?: string | null; closed_at?: string | null };
        Relationships: [];
      };
      payroll_items: {
        Row: {
          id: string; payroll_run_id: string; employee_id: string;
          base_salary: number; days_worked: number; days_in_period: number;
          gross: number; deductions: number; net: number; notes: string;
        };
        Insert: {
          id?: string; payroll_run_id: string; employee_id: string;
          base_salary?: number; days_worked?: number; days_in_period?: number;
          gross?: number; deductions?: number; net?: number; notes?: string;
        };
        Update: {
          base_salary?: number; days_worked?: number; days_in_period?: number;
          gross?: number; deductions?: number; net?: number; notes?: string;
        };
        Relationships: [];
      };
      bills_of_materials: {
        Row: {
          id: string; product_id: string; name: string; yield: number;
          notes: string; active: boolean; created_at: string; updated_at: string;
        };
        Insert: { id?: string; product_id: string; name: string; yield?: number; notes?: string; active?: boolean };
        Update: Partial<Database["public"]["Tables"]["bills_of_materials"]["Insert"]>;
        Relationships: [];
      };
      bom_components: {
        Row: {
          id: string; bom_id: string; component_product_id: string;
          quantity_per_unit: number; position: number;
        };
        Insert: {
          id?: string; bom_id: string; component_product_id: string;
          quantity_per_unit: number; position?: number;
        };
        Update: { quantity_per_unit?: number; position?: number };
        Relationships: [];
      };
      production_orders: {
        Row: {
          id: string; code: string; bom_id: string; warehouse_id: string;
          quantity: number; status: ProductionStatus; notes: string;
          created_by: string | null; produced_by: string | null;
          produced_at: string | null;
          movement_in_id: string | null; movement_out_id: string | null;
          created_at: string; updated_at: string;
        };
        Insert: {
          id?: string; code?: string; bom_id: string; warehouse_id: string;
          quantity: number; notes?: string; created_by?: string | null;
        };
        Update: {
          bom_id?: string; warehouse_id?: string; quantity?: number;
          status?: ProductionStatus; notes?: string;
          produced_by?: string | null; produced_at?: string | null;
          movement_in_id?: string | null; movement_out_id?: string | null;
        };
        Relationships: [];
      };
      accounts: {
        Row: {
          id: string; code: string; name: string; type: AccountType;
          parent_id: string | null; active: boolean;
          created_at: string; updated_at: string;
        };
        Insert: {
          id?: string; code: string; name: string; type: AccountType;
          parent_id?: string | null; active?: boolean;
        };
        Update: Partial<Database["public"]["Tables"]["accounts"]["Insert"]>;
        Relationships: [];
      };
      journal_entries: {
        Row: {
          id: string; code: string; entry_date: string;
          description: string; reference_type: string; reference_id: string | null;
          total_debit: number; total_credit: number;
          status: JournalEntryStatus;
          created_by: string | null; posted_by: string | null; posted_at: string | null;
          created_at: string; updated_at: string;
        };
        Insert: {
          id?: string; code?: string; entry_date?: string;
          description?: string; reference_type?: string; reference_id?: string | null;
          created_by?: string | null;
        };
        Update: {
          entry_date?: string; description?: string;
          reference_type?: string; reference_id?: string | null;
          status?: JournalEntryStatus;
          posted_by?: string | null; posted_at?: string | null;
        };
        Relationships: [];
      };
      journal_lines: {
        Row: {
          id: string; entry_id: string; account_id: string;
          debit: number; credit: number; description: string; position: number;
        };
        Insert: {
          id?: string; entry_id: string; account_id: string;
          debit?: number; credit?: number; description?: string; position?: number;
        };
        Update: {
          account_id?: string; debit?: number; credit?: number;
          description?: string; position?: number;
        };
        Relationships: [];
      };
      exchange_rates: {
        Row: { day: string; currency_from: string; currency_to: string; rate: number; notes: string; created_at: string };
        Insert: { day: string; currency_from: string; currency_to: string; rate: number; notes?: string };
        Update: { rate?: number; notes?: string };
        Relationships: [];
      };
      remittance_operations: {
        Row: {
          id: string; code: string;
          sender_name: string; sender_phone: string;
          beneficiary_name: string; beneficiary_phone: string;
          beneficiary_doc: string; beneficiary_address: string;
          amount_usd: number; exchange_rate: number; amount_cup: number;
          commission_usd: number;
          payout_method: RemittancePayoutMethod;
          status: RemittanceStatus;
          notes: string;
          created_by: string | null; paid_by: string | null; paid_at: string | null;
          created_at: string; updated_at: string;
        };
        Insert: {
          id?: string; code?: string;
          sender_name: string; sender_phone?: string;
          beneficiary_name: string; beneficiary_phone?: string;
          beneficiary_doc?: string; beneficiary_address?: string;
          amount_usd: number; exchange_rate: number;
          commission_usd?: number;
          payout_method?: RemittancePayoutMethod;
          notes?: string;
          created_by?: string | null;
        };
        Update: {
          sender_name?: string; sender_phone?: string;
          beneficiary_name?: string; beneficiary_phone?: string;
          beneficiary_doc?: string; beneficiary_address?: string;
          amount_usd?: number; exchange_rate?: number;
          commission_usd?: number;
          payout_method?: RemittancePayoutMethod;
          status?: RemittanceStatus;
          notes?: string;
          paid_by?: string | null; paid_at?: string | null;
        };
        Relationships: [];
      };
      inventory_movement_lines: {
        Row: {
          id: string;
          movement_id: string;
          product_id: string;
          quantity: number;
          unit_cost: number | null;
        };
        Insert: {
          id?: string;
          movement_id: string;
          product_id: string;
          quantity: number;
          unit_cost?: number | null;
        };
        Update: never;
        Relationships: [];
      };
      inventory_lots: {
        Row: {
          id: string;
          product_id: string;
          warehouse_id: string;
          unit_cost: number;
          qty_received: number;
          qty_remaining: number;
          source_type: string;
          source_id: string | null;
          movement_id: string | null;
          received_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          product_id: string;
          warehouse_id: string;
          unit_cost?: number;
          qty_received: number;
          qty_remaining: number;
          source_type?: string;
          source_id?: string | null;
          movement_id?: string | null;
          received_at?: string;
        };
        Update: { unit_cost?: number; qty_remaining?: number };
        Relationships: [];
      };
      inventory_lot_consumptions: {
        Row: {
          id: string;
          lot_id: string;
          movement_id: string;
          product_id: string;
          warehouse_id: string;
          quantity: number;
          unit_cost: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          lot_id: string;
          movement_id: string;
          product_id: string;
          warehouse_id: string;
          quantity: number;
          unit_cost: number;
        };
        Update: never;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
