-- Patients
create table patients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text not null,
  email text,
  birth_date date,
  cpf text,
  address text,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Treatments
create table treatments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null,
  is_predefined boolean default false
);

-- Treatment sessions
create table treatment_sessions (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid references patients(id) on delete cascade,
  treatment_id uuid references treatments(id),
  session_date date not null,
  notes text,
  products_used text,
  dose text,
  next_session_date date,
  created_at timestamptz default now()
);

-- Patient photos (stored in Supabase Storage bucket "patient-photos")
create table patient_photos (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid references patients(id) on delete cascade,
  session_id uuid references treatment_sessions(id) on delete set null,
  url text not null,
  label text,
  taken_at timestamptz default now(),
  created_at timestamptz default now()
);

-- Appointments
create table appointments (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid references patients(id) on delete cascade,
  treatment_id uuid references treatments(id),
  appointment_date timestamptz not null,
  duration_minutes int default 60,
  status text default 'scheduled' check (status in ('scheduled','completed','cancelled','no_show')),
  notes text,
  created_at timestamptz default now()
);

-- Ultrassom Microfocado: leituras do contador acumulativo do aparelho, por ponteira
create table ultrasound_applications (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid references patients(id) on delete cascade,
  tip text not null check (tip in ('1.5','3.0','4.5','8.0')),
  counter_reading int not null,
  shots int not null,
  session_date date not null,
  created_at timestamptz default now()
);

-- Insert predefined treatments
insert into treatments (name, category, is_predefined) values
  ('Toxina Botulínica', 'Facial', true),
  ('Bioestimulador', 'Facial', true),
  ('Preenchedor Facial', 'Facial', true),
  ('Preenchedor Labial', 'Facial', true),
  ('Ultrassom Microfocado', 'Facial', true),
  ('Fios de PDO', 'Facial', true);
