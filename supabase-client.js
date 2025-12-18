import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

// SINGLETON PATTERN - hanya satu instance supabase
let supabaseInstance = null;
let configPromise = null;
let isInitializing = false;

// Fungsi untuk load config dari API (hanya sekali)
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
            configPromise = null; // Reset on error so it can retry
            throw err;
        });
    
    return configPromise;
}

// Fungsi untuk mendapatkan supabase client (SINGLETON)
export async function getSupabase() {
    // Jika sudah ada instance, return langsung
    if (supabaseInstance) {
        return supabaseInstance;
    }

    // Jika sedang proses inisialisasi, tunggu
    if (isInitializing) {
        // Tunggu sampai instance tersedia
        while (isInitializing) {
            await new Promise(resolve => setTimeout(resolve, 50));
        }
        return supabaseInstance;
    }

    try {
        isInitializing = true;
        const config = await loadConfig();
        
        // Double check - mungkin instance sudah dibuat saat waiting
        if (!supabaseInstance) {
            supabaseInstance = createClient(config.supabaseUrl, config.supabaseKey);
            console.log('✅ Supabase client initialized (singleton)');
        }
        
        return supabaseInstance;
    } finally {
        isInitializing = false;
    }
}

let onlineUsersSubscription = null;
let activityLogsSubscription = null;

// Debug mode
const DEBUG = true;

function debugLog(...args) {
    if (DEBUG) {
        console.log('[DEBUG]', ...args);
    }
}

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

        if (error) {
            console.error('Error getting current user:', error);
            return null;
        }

        return data;
    } catch (err) {
        console.error('Exception getting current user:', err);
        return null;
    }
}

export async function loginUser(username, password) {
    try {
        debugLog('Attempting login for:', username);
        
        const client = await getSupabase();
        const { data, error } = await client
            .from('users')
            .select('*')
            .eq('username', username)
            .eq('password', password)
            .maybeSingle();

        if (error) {
            console.error('Login error:', error);
            return { success: false, error: 'Terjadi kesalahan saat login. Silakan coba lagi.' };
        }

        if (!data) {
            return { success: false, error: 'Username atau password salah' };
        }

        localStorage.setItem('userId', data.id);
        localStorage.setItem('username', data.username);

        await markUserOnline(data.id, data.username);
        
        debugLog('Logging LOGIN activity for user:', data.id);
        const logResult = await logActivity(data.id, 'LOGIN', 'User logged in');
        debugLog('LOGIN activity log result:', logResult);

        return { success: true, user: data };
    } catch (err) {
        console.error('Exception during login:', err);
        return { success: false, error: 'Terjadi kesalahan. Silakan coba lagi.' };
    }
}

export async function signupUser(nik, username, email, password) {
    try {
        const client = await getSupabase();
        const { data: existingUser, error: checkError } = await client
            .from('users')
            .select('username, email, nik')
            .or(`username.eq.${username},email.eq.${email},nik.eq.${nik}`)
            .maybeSingle();

        if (checkError && checkError.code !== 'PGRST116') {
            console.error('Check existing user error:', checkError);
            return { success: false, error: 'Terjadi kesalahan. Silakan coba lagi.' };
        }

        if (existingUser) {
            if (existingUser.username === username) {
                return { success: false, error: 'Username sudah digunakan' };
            }
            if (existingUser.email === email) {
                return { success: false, error: 'Email sudah digunakan' };
            }
            if (existingUser.nik === nik) {
                return { success: false, error: 'NIK sudah digunakan' };
            }
        }

        const { data, error } = await client
            .from('users')
            .insert([{ nik, username, email, password }])
            .select()
            .single();

        if (error) {
            console.error('Signup error:', error);
            return { success: false, error: 'Gagal membuat akun. Silakan coba lagi.' };
        }

        return { success: true, user: data };
    } catch (err) {
        console.error('Exception during signup:', err);
        return { success: false, error: 'Terjadi kesalahan. Silakan coba lagi.' };
    }
}

export async function logoutUser() {
    try {
        const userId = localStorage.getItem('userId');
        if (userId) {
            debugLog('Logging LOGOUT activity for user:', userId);
            await logActivity(userId, 'LOGOUT', 'User logged out');
            
            const client = await getSupabase();
            await client
                .from('online_users')
                .delete()
                .eq('user_id', userId);
        }
    } catch (err) {
        console.error('Error during logout:', err);
    } finally {
        localStorage.removeItem('userId');
        localStorage.removeItem('username');
        window.location.href = '/login.html';
    }
}

export async function markUserOnline(userId, username) {
    try {
        const client = await getSupabase();
        const { data: existing } = await client
            .from('online_users')
            .select('id')
            .eq('user_id', userId)
            .maybeSingle();

        if (existing) {
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
        console.error('Error marking user online:', err);
    }
}

export async function updateUserActivity() {
    const userId = localStorage.getItem('userId');
    if (!userId) return;

    const username = localStorage.getItem('username');
    await markUserOnline(userId, username);
}

export async function getOnlineUsers() {
    try {
        const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();
        
        const client = await getSupabase();
        const { data, error } = await client
            .from('online_users')
            .select('user_id, username, last_seen')
            .gte('last_seen', twoMinutesAgo)
            .order('username');

        if (error) {
            console.error('Error getting online users:', error);
            return [];
        }

        return data || [];
    } catch (err) {
        console.error('Exception getting online users:', err);
        return [];
    }
}

export async function logActivity(userId, activityType, description, metadata = null) {
    try {
        debugLog('=== logActivity called ===');
        debugLog('userId:', userId);
        debugLog('activityType:', activityType);
        debugLog('description:', description);
        debugLog('metadata:', metadata);

        if (!userId) {
            console.error('logActivity: userId is required');
            return { success: false, error: 'userId is required' };
        }

        const activityData = {
            user_id: userId,
            activity_type: activityType,
            description: description,
            metadata: metadata,
            created_at: new Date().toISOString()
        };

        debugLog('Inserting activity data:', activityData);

        const client = await getSupabase();
        const { data, error } = await client
            .from('activity_logs')
            .insert([activityData])
            .select();

        if (error) {
            console.error('❌ Error logging activity:', error);
            console.error('Error code:', error.code);
            console.error('Error message:', error.message);
            console.error('Error hint:', error.hint);
            console.error('Error details:', error.details);
            
            if (error.code === '42501') {
                console.error('⚠️ PERMISSION DENIED - Check RLS policies!');
            } else if (error.code === '23503') {
                console.error('⚠️ FOREIGN KEY VIOLATION - user_id may not exist');
            }
            
            return { success: false, error };
        }

        debugLog('✅ Activity logged successfully:', data);
        return { success: true, data };
        
    } catch (err) {
        console.error('❌ Exception in logActivity:', err);
        console.error('Exception stack:', err.stack);
        return { success: false, error: err };
    }
}

export async function getActivityLogs(limit = 50) {
    try {
        debugLog('=== getActivityLogs called ===');
        debugLog('Fetching', limit, 'activity logs...');
        
        const client = await getSupabase();
        const { data: simpleData, error: simpleError, count: simpleCount } = await client
            .from('activity_logs')
            .select('*', { count: 'exact' })
            .order('created_at', { ascending: false })
            .limit(limit);

        debugLog('Simple query result:', {
            dataLength: simpleData?.length,
            error: simpleError,
            count: simpleCount
        });

        if (simpleError) {
            console.error('Error in simple query:', simpleError);
            return [];
        }

        if (simpleData && simpleData.length > 0) {
            try {
                const userIds = [...new Set(simpleData.map(a => a.user_id))];
                debugLog('Fetching user info for', userIds.length, 'users');
                
                const { data: users, error: usersError } = await client
                    .from('users')
                    .select('id, username, nik')
                    .in('id', userIds);

                if (usersError) {
                    console.error('Error fetching users:', usersError);
                    return simpleData;
                }

                const enrichedData = simpleData.map(activity => ({
                    ...activity,
                    users: users.find(u => u.id === activity.user_id) || null
                }));

                debugLog('Successfully enriched', enrichedData.length, 'activities with user info');
                return enrichedData;
                
            } catch (enrichError) {
                console.error('Error enriching data:', enrichError);
                return simpleData;
            }
        }

        debugLog('No activities found');
        return [];
        
    } catch (err) {
        console.error('Exception getting activity logs:', err);
        return [];
    }
}

export async function getUserActivityLogs(userId, limit = 20) {
    try {
        const client = await getSupabase();
        const { data, error } = await client
            .from('activity_logs')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(limit);

        if (error) {
            console.error('Error getting user activity logs:', error);
            return [];
        }

        return data || [];
    } catch (err) {
        console.error('Exception getting user activity logs:', err);
        return [];
    }
}

export async function testActivityLogsAccess() {
    try {
        debugLog('=== Testing activity_logs access ===');
        
        const client = await getSupabase();
        
        debugLog('Test 1: Testing SELECT permission...');
        const { data: selectData, error: selectError, count } = await client
            .from('activity_logs')
            .select('*', { count: 'exact', head: false })
            .limit(1);
        
        if (selectError) {
            console.error('❌ SELECT test failed:', selectError);
            return { success: false, error: selectError, test: 'SELECT' };
        }
        debugLog('✅ SELECT test passed. Count:', count);
        
        const userId = localStorage.getItem('userId');
        if (!userId) {
            debugLog('⚠️ No userId in localStorage, skipping INSERT test');
            return { 
                success: true, 
                selectWorks: true, 
                insertTest: 'skipped',
                count 
            };
        }
        
        debugLog('Test 2: Testing INSERT permission...');
        const testData = {
            user_id: userId,
            activity_type: 'TEST',
            description: 'Access test',
            created_at: new Date().toISOString()
        };
        
        const { data: insertData, error: insertError } = await client
            .from('activity_logs')
            .insert([testData])
            .select();
        
        if (insertError) {
            console.error('❌ INSERT test failed:', insertError);
            return { 
                success: false, 
                error: insertError, 
                test: 'INSERT',
                selectWorks: true,
                count
            };
        }
        
        debugLog('✅ INSERT test passed:', insertData);
        
        if (insertData && insertData[0]) {
            await client
                .from('activity_logs')
                .delete()
                .eq('id', insertData[0].id);
            debugLog('Test data cleaned up');
        }
        
        return { 
            success: true, 
            selectWorks: true,
            insertWorks: true,
            count,
            testData: insertData 
        };
        
    } catch (err) {
        console.error('❌ Test exception:', err);
        return { success: false, error: err, test: 'EXCEPTION' };
    }
}

// Realtime Subscriptions dengan channel management yang lebih baik
export async function subscribeToOnlineUsers(callback) {
    try {
        const client = await getSupabase();
        
        // Unsubscribe dari channel lama jika ada
        if (onlineUsersSubscription) {
            await client.removeChannel(onlineUsersSubscription);
        }
        
        onlineUsersSubscription = client
            .channel('online_users_changes')
            .on('postgres_changes', 
                { event: '*', schema: 'public', table: 'online_users' },
                () => {
                    callback();
                }
            )
            .subscribe();
            
        debugLog('✅ Subscribed to online_users changes');
    } catch (err) {
        console.error('Error subscribing to online users:', err);
    }
}

export async function subscribeToActivityLogs(callback) {
    try {
        const client = await getSupabase();
        
        // Unsubscribe dari channel lama jika ada
        if (activityLogsSubscription) {
            await client.removeChannel(activityLogsSubscription);
        }
        
        activityLogsSubscription = client
            .channel('activity_logs_changes')
            .on('postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'activity_logs' },
                (payload) => {
                    debugLog('📥 New activity log received via realtime:', payload);
                    callback(payload.new);
                }
            )
            .subscribe();
            
        debugLog('✅ Subscribed to activity_logs changes');
    } catch (err) {
        console.error('Error subscribing to activity logs:', err);
    }
}

export async function unsubscribeFromOnlineUsers() {
    if (onlineUsersSubscription) {
        try {
            const client = await getSupabase();
            await client.removeChannel(onlineUsersSubscription);
            onlineUsersSubscription = null;
            debugLog('✅ Unsubscribed from online_users changes');
        } catch (err) {
            console.error('Error unsubscribing from online users:', err);
        }
    }
}

export async function unsubscribeFromActivityLogs() {
    if (activityLogsSubscription) {
        try {
            const client = await getSupabase();
            await client.removeChannel(activityLogsSubscription);
            activityLogsSubscription = null;
            debugLog('✅ Unsubscribed from activity_logs changes');
        } catch (err) {
            console.error('Error unsubscribing from activity logs:', err);
        }
    }
}

export function trackNavigation(menuName) {
    const userId = localStorage.getItem('userId');
    if (userId) {
        debugLog('Tracking navigation to:', menuName);
        logActivity(userId, 'NAVIGATION', `Accessed ${menuName}`, { menu: menuName });
    }
}

export function isAuthenticated() {
    return localStorage.getItem('userId') !== null;
}

export function requireAuth() {
    if (!isAuthenticated()) {
        window.location.href = '/login.html';
    }
}

// Visibility change handler
document.addEventListener('visibilitychange', async () => {
    if (document.hidden) {
        const userId = localStorage.getItem('userId');
        if (userId) {
            await updateUserActivity();
        }
    } else {
        await updateUserActivity();
    }
});

// Beforeunload handler
window.addEventListener('beforeunload', async () => {
    const userId = localStorage.getItem('userId');
    if (userId) {
        try {
            const config = await loadConfig();
            const payload = JSON.stringify({
                user_id: userId,
                activity_type: 'PAGE_UNLOAD',
                description: 'User left the page',
                created_at: new Date().toISOString()
            });
            
            const url = `${config.supabaseUrl}/rest/v1/activity_logs`;
            const blob = new Blob([payload], { type: 'application/json' });
            navigator.sendBeacon(url, blob);
        } catch (err) {
            console.error('Error in beforeunload:', err);
        }
    }
});