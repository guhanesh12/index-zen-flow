// Re-export the single shared Supabase client so every part of the app
// uses the SAME auth session storage (avoids "please login" false negatives).
export { supabase } from "@/integrations/supabase/client";
export { supabase as default } from "@/integrations/supabase/client";
