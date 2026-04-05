import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/core/domain/database.types';

// In Next.js, we need to handle both client and server side.
// For the CSV import which is mostly a client action (or API route), we'll provide a standard client.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://wgwukocqvwigxctessvg.supabase.co';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indnd3Vrb2NxdndpZ3hjdGVzc3ZnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM3Njg1OTAsImV4cCI6MjA4OTM0NDU5MH0.fpLohwNCp5ef8aYXkP71MeZQSwXTXbixVRG7nSAJF7s';

export const supabase = createClient<Database>(supabaseUrl, supabaseKey);
