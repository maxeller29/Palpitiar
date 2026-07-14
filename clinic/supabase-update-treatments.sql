-- Atualiza tratamentos predefinidos para nova lista
-- Execute no SQL Editor do Supabase

-- Remove tratamentos predefinidos antigos
delete from treatments where is_predefined = true;

-- Insere nova lista de 6 tratamentos
insert into treatments (name, category, is_predefined) values
  ('Toxina Botulínica', 'Facial', true),
  ('Bioestimulador',    'Facial', true),
  ('Preenchedor Facial','Facial', true),
  ('Preenchedor Labial','Facial', true),
  ('Ultrassom Microfocado', 'Facial', true),
  ('Fios de PDO',       'Facial', true);
