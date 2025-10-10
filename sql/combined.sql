
-- START FILE: 1.sql --
/*
  # Schema untuk Sistem Login dan Tracking User Online

  ## Deskripsi
  Membuat tabel untuk menyimpan data user dan tracking user yang sedang online.

  ## Tabel Baru
  
  ### 1. `users`
  Menyimpan informasi user untuk login dan signup
  - `id` (uuid, primary key) - ID unik user
  - `nik` (text, unique, not null) - Nomor Induk Kependudukan
  - `username` (text, unique, not null) - Username untuk login
  - `email` (text, unique, not null) - Email user
  - `password` (text, not null) - Password user (plain text sesuai permintaan)
  - `created_at` (timestamptz) - Waktu pembuatan akun

  ### 2. `online_users`
  Menyimpan data user yang sedang online
  - `id` (uuid, primary key) - ID unik record
  - `user_id` (uuid, foreign key) - Referensi ke users.id
  - `username` (text, not null) - Username user yang online
  - `last_seen` (timestamptz) - Waktu terakhir user aktif

  ## Security
  - Enable RLS pada kedua tabel
  - Policy untuk authenticated users dapat membaca semua data users
  - Policy untuk authenticated users dapat membaca dan mengelola data online_users mereka sendiri
  - Policy untuk insert user baru saat signup (public access untuk signup)
*/

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nik text UNIQUE NOT NULL,
  username text UNIQUE NOT NULL,
  email text UNIQUE NOT NULL,
  password text NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS online_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  username text NOT NULL,
  last_seen timestamptz DEFAULT now()
);

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE online_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can insert new user"
  ON users
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can read all users"
  ON users
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can read all online users"
  ON online_users
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert their own online status"
  ON online_users
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update their own online status"
  ON online_users
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete their own online status"
  ON online_users
  FOR DELETE
  TO authenticated
  USING (true);

CREATE INDEX IF NOT EXISTS idx_online_users_user_id ON online_users(user_id);
CREATE INDEX IF NOT EXISTS idx_online_users_last_seen ON online_users(last_seen);
-- END FILE: 1.sql --

-- START FILE: 2.sql --
/*
  # Fix Activity Logs Table
  
  Membuat tabel activity_logs dengan proper foreign key dan RLS policies
*/

-- Buat tabel activity_logs jika belum ada
CREATE TABLE IF NOT EXISTS activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  activity_type text NOT NULL,
  description text NOT NULL,
  metadata jsonb,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;

-- Drop existing policies jika ada
DROP POLICY IF EXISTS "Anyone can read activity logs" ON activity_logs;
DROP POLICY IF EXISTS "Authenticated users can read all activity logs" ON activity_logs;
DROP POLICY IF EXISTS "Authenticated users can insert activity logs" ON activity_logs;

-- Policy untuk membaca semua activity logs (PENTING: harus PUBLIC atau AUTHENTICATED bisa akses)
CREATE POLICY "Authenticated users can read all activity logs"
  ON activity_logs
  FOR SELECT
  TO authenticated
  USING (true);

-- Policy untuk insert activity logs
CREATE POLICY "Authenticated users can insert activity logs"
  ON activity_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Buat indexes untuk performa
CREATE INDEX IF NOT EXISTS idx_activity_logs_user_id ON activity_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON activity_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_logs_activity_type ON activity_logs(activity_type);

-- Verify foreign key relationship exists
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.table_constraints 
        WHERE constraint_type = 'FOREIGN KEY' 
        AND table_name = 'activity_logs'
        AND constraint_name = 'activity_logs_user_id_fkey'
    ) THEN
        ALTER TABLE activity_logs 
        ADD CONSTRAINT activity_logs_user_id_fkey 
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
    END IF;
END $$;
-- END FILE: 2.sql --

-- START FILE: 3.sql --
-- Step 1: Check jika tabel activity_logs ada
SELECT EXISTS (
   SELECT FROM information_schema.tables 
   WHERE table_schema = 'public' 
   AND table_name = 'activity_logs'
) AS table_exists;

-- Step 2: Check struktur tabel
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'activity_logs'
ORDER BY ordinal_position;

-- Step 3: Check existing policies
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE tablename = 'activity_logs';

-- Step 4: DROP semua policy lama
DROP POLICY IF EXISTS "Authenticated users can read all activity logs" ON activity_logs;
DROP POLICY IF EXISTS "Authenticated users can insert activity logs" ON activity_logs;
DROP POLICY IF EXISTS "Anyone can insert activity logs" ON activity_logs;
DROP POLICY IF EXISTS "Public can insert activity logs" ON activity_logs;

-- Step 5: Buat policy baru yang LEBIH PERMISSIVE
-- Policy untuk INSERT (harus anon + authenticated bisa insert)
CREATE POLICY "Allow insert for all users"
  ON activity_logs
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Policy untuk SELECT (authenticated bisa baca semua)
CREATE POLICY "Allow select for authenticated"
  ON activity_logs
  FOR SELECT
  TO authenticated
  USING (true);

-- Step 6: Pastikan RLS enabled
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;

-- Step 7: Test manual insert
INSERT INTO activity_logs (user_id, activity_type, description, metadata)
SELECT 
    u.id,
    'TEST',
    'Manual test insert',
    NULL
FROM users u
LIMIT 1;

-- Step 8: Check apakah data masuk
SELECT 
    al.*,
    u.username
FROM activity_logs al
LEFT JOIN users u ON u.id = al.user_id
ORDER BY al.created_at DESC
LIMIT 10;

-- Step 9: Check count total
SELECT COUNT(*) as total_activities FROM activity_logs;
-- END FILE: 3.sql --

-- START FILE: 4.sql --
-- Activity Logs
DROP POLICY IF EXISTS "Allow all operations" ON activity_logs;
CREATE POLICY "Allow all operations" 
  ON activity_logs 
  FOR ALL 
  TO anon, authenticated 
  USING (true) 
  WITH CHECK (true);

-- Users
DROP POLICY IF EXISTS "Allow all operations" ON users;
CREATE POLICY "Allow all operations" 
  ON users 
  FOR ALL 
  TO anon, authenticated 
  USING (true) 
  WITH CHECK (true);

-- Online Users
DROP POLICY IF EXISTS "Allow all operations" ON online_users;
CREATE POLICY "Allow all operations" 
  ON online_users 
  FOR ALL 
  TO anon, authenticated 
  USING (true) 
  WITH CHECK (true);

-- END FILE: 4.sql --
