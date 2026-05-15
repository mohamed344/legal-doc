export type DocumentStatus = "brouillon" | "valide" | "facture";
export type InvoiceStatus = "brouillon" | "envoyee" | "payee";
export type VariableType = "text" | "date" | "number" | "select" | "checkbox";

export interface AppUser {
  id: string;
  user_id: string;
  full_name: string | null;
  phone: string | null;
  email: string | null;
  avatar_url: string | null;
  last_login_at: string | null;
  role_id: string;
  role_name: string | null;
  is_admin: boolean;
  is_active: boolean;
  created_at: string;
}

export interface AppRole {
  id: string;
  name: string;
  is_system: boolean;
  is_admin: boolean;
  created_at: string;
}

export interface RolePermissionRow {
  role_id: string;
  page: string;
  action: string;
}

export interface Template {
  id: string;
  name: string;
  description: string | null;
  body_html: string | null;
  body_json: Record<string, unknown> | null;
  category: string | null;
  default_price: number | null;
  created_by: string;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
}

export type VariableScope = "per_row" | "batch";

export interface TemplateVariable {
  id: string;
  template_id: string;
  key: string;
  label: string;
  type: VariableType;
  options: string[] | null;
  category: string | null;
  required: boolean;
  order_index: number;
  scope: VariableScope;
}

export interface Client {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
  created_by: string;
  created_at: string;
}

export interface Document {
  id: string;
  template_id: string;
  client_id: string | null;
  name: string;
  status: DocumentStatus;
  filled_data: Record<string, unknown>;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export type InvoiceCustomFieldType = "text" | "number" | "date";
export type InvoiceCustomFieldDisplay = "inline" | "block" | "table";

export interface InvoiceCustomField {
  id: string;
  label: string;
  value: string;
  type: InvoiceCustomFieldType;
  display: InvoiceCustomFieldDisplay;
}

export interface Invoice {
  id: string;
  number: string;
  client_id: string;
  status: InvoiceStatus;
  subtotal: number;
  total: number;
  issued_at: string;
  due_at: string | null;
  notes: string | null;
  custom_fields: InvoiceCustomField[];
  created_by: string;
  created_at: string;
}

export interface InvoiceLine {
  id: string;
  invoice_id: string;
  description: string;
  document_id: string | null;
  qty: number;
  unit_price: number;
  amount: number;
}

export interface ArchivedUpload {
  id: string;
  template_id: string | null;
  name: string;
  file_path: string;
  file_name: string;
  file_mime_type: string | null;
  file_size: number | null;
  extracted_data: Record<string, string>;
  notes: string | null;
  batch_id: string | null;
  created_by: string;
  archived_at: string;
  created_at: string;
}

export interface Database {
  public: {
    Tables: {
      users: { Row: AppUser; Insert: Partial<AppUser>; Update: Partial<AppUser> };
      templates: { Row: Template; Insert: Partial<Template>; Update: Partial<Template> };
      template_variables: { Row: TemplateVariable; Insert: Partial<TemplateVariable>; Update: Partial<TemplateVariable> };
      documents: { Row: Document; Insert: Partial<Document>; Update: Partial<Document> };
      clients: { Row: Client; Insert: Partial<Client>; Update: Partial<Client> };
      invoices: { Row: Invoice; Insert: Partial<Invoice>; Update: Partial<Invoice> };
      invoice_lines: { Row: InvoiceLine; Insert: Partial<InvoiceLine>; Update: Partial<InvoiceLine> };
      archived_uploads: {
        Row: ArchivedUpload;
        Insert: Partial<ArchivedUpload>;
        Update: Partial<ArchivedUpload>;
      };
    };
  };
}
