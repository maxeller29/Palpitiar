-- Adiciona a tabela do módulo Ultrassom Microfocado a um banco já existente
-- Execute no SQL Editor do Supabase

create table if not exists ultrasound_applications (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid references patients(id) on delete cascade,
  tip text not null check (tip in ('1.5','3.0','4.5','8.0')),
  counter_reading int not null,
  shots int not null,
  session_date date not null,
  created_at timestamptz default now()
);
