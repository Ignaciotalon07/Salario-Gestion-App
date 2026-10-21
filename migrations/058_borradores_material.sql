-- 058: material enviado sugerido en los borradores de Soporte (Whaticket)
-- Valores: ninguno | video | pdf | varios (mismos que el campo "Material enviado" del formulario)
ALTER TABLE consultas_borradores
  ADD COLUMN IF NOT EXISTS material_sugerido text;
