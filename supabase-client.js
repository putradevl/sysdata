// ✅ FIX: gunakan esm.sh (stabil, tidak error AuthClient)
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.47.10';

// ===============================
// SUPABASE SINGLETON
// ===============================
let supabaseInstance = null;
let configPromise = null;
let isInitializing = false;

// Load config sekali saja
async function loadConfig() {
    if (configPromise) return configPromise;

    configPromise = fetch('/api/config')
        .then(res => {
            if (!res.ok) throw new Error('Failed to load config');
            return res.json();
        })
        .then(config => {
            if (!config.supabaseUrl || !config.supabaseKey) {
                throw new Error('Invalid config received');
            }
            return config;
        })
        .catch(err => {
            console.error('Error loading config:', err);
            configPromise = null;
            throw err;
        });

    return configPromise;
}

// Ambil Supabase client (singleton, async-safe)
export async function getSupabase() {
    if (supabaseInstance) return supabaseInstance;

    if (isInitializing) {
        while (isInitializing) {
            await new Promise(r => setTimeout(r, 50));
        }
        return supabaseInstance;
    }

    try {
        isInitializing = true;
        const config = await loadConfig();

        if (!supabaseInstance) {
            supabaseInstance = createClient(
                config.supabaseUrl,
                config.supabaseKey
            );
            console.log('✅ Supabase client initialized (singleton)');
        }

        return supabaseInstance;
    } finally {
        isInitializing = false;
    }
}

// ===============================
// DEBUG
// ===============================
const DEBUG = true;
function debugLog(...args) {
    if (DEBUG) console.log('[DEBUG]', ...args);
}

// ===============================
// AUTH & USER
// ===============================
export async function getCurrentUser() {
    const userId = localStorage.getItem('userId');
    if (!userId) return null;

    try {
        const client = await getSupabase();
        const { data, error } = await client
            .from('users')
            .select('*')
            .eq('id', userId)
            .maybeSingle();

        if (error) return null;
        return data;
    } catch (err) {
        console.error(err);
        return null;
    }
}

export async function loginUser(username, password) {
    try {
        debugLog('Login:', username);
        const client = await getSupabase();

        const { data, error } = await client
            .from('users')
            .select('*')
            .eq('username', username)
            .eq('password', password)
            .maybeSingle();

        if (error || !data) {
            return { success: false, error: 'Username atau password salah' };
        }

        localStorage.setItem('userId', data.id);
        localStorage.setItem('username', data.username);

        await markUserOnline(data.id, data.username);
        await logActivity(data.id, 'LOGIN', 'User logged in');

        return { success: true, user: data };
    } catch (err) {
        console.error(err);
        return { success: false, error: 'Terjadi kesalahan' };
    }
}

export async function signupUser(nik, username, email, password) {
    try {
        const client = await getSupabase();

        const { data: existing } = await client
            .from('users')
            .select('username,email,nik')
            .or(`username.eq.${username},email.eq.${email},nik.eq.${nik}`)
            .maybeSingle();

        if (existing) {
            if (existing.username === username) return { success: false, error: 'Username sudah digunakan' };
            if (existing.email === email) return { success: false, error: 'Email sudah digunakan' };
            if (existing.nik === nik) return { success: false, error: 'NIK sudah digunakan' };
        }

        const { data, error } = await client
            .from('users')
            .insert([{ nik, username, email, password }])
            .select()
            .single();

        if (error) throw error;
        return { success: true, user: data };
    } catch (err) {
        console.error(err);
        return { success: false, error: 'Gagal membuat akun' };
    }
}

export async function logoutUser() {
    try {
        const userId = localStorage.getItem('userId');
        if (userId) {
            await logActivity(userId, 'LOGOUT', 'User logged out');
            const client = await getSupabase();
            await client.from('online_users').delete().eq('user_id', userId);
        }
    } finally {
        localStorage.clear();
        window.location.href = '/login.html';
    }
}

// ===============================
// ONLINE USERS
// ===============================
export async function markUserOnline(userId, username) {
    try {
        const client = await getSupabase();
        const { data } = await client
            .from('online_users')
            .select('id')
            .eq('user_id', userId)
            .maybeSingle();

        if (data) {
            await client
                .from('online_users')
                .update({ last_seen: new Date().toISOString() })
                .eq('user_id', userId);
        } else {
            await client
                .from('online_users')
                .insert([{ user_id: userId, username, last_seen: new Date().toISOString() }]);
        }
    } catch (err) {
        console.error(err);
    }
}

export async function getOnlineUsers() {
    try {
        const client = await getSupabase();
        const since = new Date(Date.now() - 2 * 60 * 1000).toISOString();

        const { data } = await client
            .from('online_users')
            .select('*')
            .gte('last_seen', since)
            .order('username');

        return data || [];
    } catch {
        return [];
    }
}

// ===============================
// ACTIVITY LOGS
// ===============================
export async function logActivity(userId, type, description, metadata = null) {
    try {
        const client = await getSupabase();
        const { error } = await client
            .from('activity_logs')
            .insert([{
                user_id: userId,
                activity_type: type,
                description,
                metadata,
                created_at: new Date().toISOString()
            }]);

        if (error) console.error(error);
        return { success: !error };
    } catch (err) {
        console.error(err);
        return { success: false };
    }
}

export async function getActivityLogs(limit = 50) {
    try {
        const client = await getSupabase();
        const { data } = await client
            .from('activity_logs')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(limit);

        return data || [];
    } catch {
        return [];
    }
}

// ===============================
// REALTIME
// ===============================
let onlineUsersSubscription = null;
let activityLogsSubscription = null;

export async function subscribeToOnlineUsers(cb) {
    const client = await getSupabase();
    if (onlineUsersSubscription) await client.removeChannel(onlineUsersSubscription);

    onlineUsersSubscription = client
        .channel('online_users_changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'online_users' }, cb)
        .subscribe();
}

export async function subscribeToActivityLogs(cb) {
    const client = await getSupabase();
    if (activityLogsSubscription) await client.removeChannel(activityLogsSubscription);

    activityLogsSubscription = client
        .channel('activity_logs_changes')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'activity_logs' },
            payload => cb(payload.new))
        .subscribe();
}

// ===============================
// AUTH GUARD
// ===============================
export function isAuthenticated() {
    return localStorage.getItem('userId') !== null;
}

export function requireAuth() {
    if (!isAuthenticated()) {
        window.location.href = '/login.html';
    }
}
