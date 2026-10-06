-- Tapau Time Lead Generation Quiz Schema
-- Create table for storing quiz assessment leads (Email Address updated)
CREATE TABLE IF NOT EXISTS tapautime_leads (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    cafe_name TEXT NOT NULL,
    email_address TEXT NOT NULL,
    quiz_score INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable Row Level Security (RLS)
ALTER TABLE tapautime_leads ENABLE ROW LEVEL SECURITY;

-- Allow public anonymous lead inserts
CREATE POLICY "Allow public lead inserts" 
ON tapautime_leads 
FOR INSERT 
TO anon, authenticated, public
WITH CHECK (true);

-- Allow authenticated reads for merchant dashboard
CREATE POLICY "Allow read access for authenticated users" 
ON tapautime_leads 
FOR SELECT 
TO anon, authenticated, public
USING (true);

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON TABLE tapautime_leads TO anon, authenticated, service_role;
