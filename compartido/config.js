// CONFIG
// Credenciales de Supabase. La publishable key es publica por diseno
// (RLS se encarga de la seguridad), asi que esta bien que viva en el repo.

const SUPABASE_CONFIG = {
  url: "https://buxunfvdlqwoascvjdbj.supabase.co",
  publishableKey: "sb_publishable_TWp90Yf2K5Z6fTSfh0lpVA_98_a-SbM",
};

// Canal de chat con el equipo, para el botón "Chatear con nosotros" del portal de clientes.
// whatsapp: número con código de país y sin signos (ej. '5493511234567'). Si queda vacío, el botón avisa que todavía no está configurado.
const PORTAL_CONTACTO = {
  whatsapp: "5493518591357",
  mensaje:
    "Hola, soy cliente de Salario y tengo una consulta sobre mi reunión de inicio de implementacion.",
};
