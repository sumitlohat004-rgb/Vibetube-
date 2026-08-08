// ============================================================
// VIBETUBE - COMPLETE APP LOGIC
// ============================================================

import { auth, db, uploadMedia, authFunctions, firestore, CLOUDINARY, IMGBB } from "./firebase.js";

// ============================================================
// APP STATE
// ============================================================
const state = {
    currentUser: null,
    currentUid: null,
    activeChatTarget: null,
    activeHiddenChatTarget: null,
    messagesListener: null,
    hiddenMessagesListener: null,
    isUnlocked: false,
    pinAttempts: 0,
    MAX_PIN_ATTEMPTS: 5,
    selectedFile: null,
    storiesList: [],
    storyIndex: 0,
    storyInterval: null,
    viewedReels: 0,
    nextAdTrigger: 7,
    currentPage: 'login',
    profileListener: null,
    feedListener: null,
    chatListener: null,
    reelsListener: null,
    notificationListener: null
};

// ============================================================
// UTILITY FUNCTIONS
// ============================================================
window.showToast = function(message) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
};

function showLoading(show) {
    document.getElementById('loadingScreen').classList.toggle('show', show);
}

function formatTime(date) {
    if (!date) return 'Just now';
    const d = date.seconds ? new Date(date.seconds * 1000) : new Date(date);
    const now = new Date();
    const diff = Math.floor((now - d) / 1000);
    if (diff < 60) return 'Just now';
    if (diff < 3600) return Math.floor(diff / 60) + 'm';
    if (diff < 86400) return Math.floor(diff / 3600) + 'h';
    if (diff < 604800) return Math.floor(diff / 86400) + 'd';
    return d.toLocaleDateString();
}

function formatNumber(num) {
    if (!num || isNaN(num)) return '0';
    if (num < 1000) return num.toString();
    if (num < 1000000) return (num / 1000).toFixed(1) + 'K';
    return (num / 1000000).toFixed(1) + 'M';
}

function isUrlVideo(url) {
    if (!url) return false;
    const lower = url.toLowerCase();
    return lower.includes('.mp4') || lower.includes('.webm') || 
           lower.includes('.mov') || lower.includes('video/upload');
}

function usernameToEmail(username) {
    return username.trim().toLowerCase() + '@vibetube.app';
}

// ============================================================
// PAGE NAVIGATION
// ============================================================
window.showPage = function(page) {
    const pages = ['login', 'signup', 'home', 'profile', 'search', 'chat', 'reels', 
                   'create', 'notification', 'settings', 'wallet', 'about', 'hidden-chat'];
    
    pages.forEach(p => {
        const el = document.getElementById('page-' + p);
        if (el) {
            el.style.display = (p === page) ? 
                (p === 'reels' || p === 'chat' || p === 'notification' || p === 'hidden-chat' ? 'flex' : 'block') : 
                'none';
        }
    });

    state.currentPage = page;
    
    // Page specific actions
    if (page === 'home') loadFeed();
    if (page === 'profile') loadProfile();
    if (page === 'search') initSearch();
    if (page === 'chat') loadChatList();
    if (page === 'reels') loadReels();
    if (page === 'notification') loadNotifications();
    if (page === 'wallet') loadWallet();
    if (page === 'hidden-chat') checkHiddenChatStatus();
};

// ============================================================
// AUTHENTICATION
// ============================================================
async function handleLogin() {
    const username = document.getElementById('loginUsername').value.trim().toLowerCase();
    const password = document.getElementById('loginPassword').value;
    const remember = document.getElementById('loginRemember').checked;
    const errorEl = document.getElementById('loginError');

    if (!username || !password) {
        errorEl.textContent = 'Please enter username and password';
        return;
    }

    showLoading(true);
    errorEl.textContent = '';

    try {
        const persistence = remember ? authFunctions.browserLocalPersistence : authFunctions.browserSessionPersistence;
        await authFunctions.setPersistence(auth, persistence);
        await authFunctions.login(auth, usernameToEmail(username), password);
        showToast('Welcome back! 🎉');
    } catch (error) {
        errorEl.textContent = 'Invalid username or password';
        console.error('Login error:', error);
    } finally {
        showLoading(false);
    }
}

async function handleSignup() {
    const username = document.getElementById('signupUsername').value.trim().toLowerCase();
    const password = document.getElementById('signupPassword').value;
    const errorEl = document.getElementById('signupError');

    if (!/^[a-z0-9._]+$/.test(username)) {
        errorEl.textContent = 'Only a-z, 0-9, _ and . allowed';
        return;
    }
    if (!username || !password) {
        errorEl.textContent = 'Please fill all fields';
        return;
    }
    if (password.length < 6) {
        errorEl.textContent = 'Password must be at least 6 characters';
        return;
    }

    showLoading(true);
    errorEl.textContent = '';

    try {
        const usernameRef = firestore.doc(db, 'usernames', username);
        const usernameSnap = await firestore.getDoc(usernameRef);
        if (usernameSnap.exists()) {
            errorEl.textContent = 'Username already taken';
            showLoading(false);
            return;
        }

        const userCred = await authFunctions.signup(auth, usernameToEmail(username), password);
        const uid = userCred.user.uid;

        const usersSnap = await firestore.getCountFromServer(firestore.collection(db, 'users'));
        const totalUsers = usersSnap.data().count + 1;
        const earlyCreator = totalUsers <= 200;

        await firestore.setDoc(firestore.doc(db, 'users', uid), {
            uid, username, name: '', bio: 'Hey there! I am using VibeTube ✨',
            profilePhoto: '', coverPhoto: '', followers: 0, following: 0,
            posts: 0, reels: 0, points: 0, status: 'ACTIVE',
            userIndex: totalUsers, isFirstWithdraw: true,
            earlyCreator, rewardedAdsUnlocked: earlyCreator,
            hiddenChatPin: null, hiddenChats: [],
            createdAt: Date.now()
        });
        await firestore.setDoc(firestore.doc(db, 'usernames', username), { uid });

        showToast('Account created successfully! 🎉');
    } catch (error) {
        errorEl.textContent = error.message;
        console.error('Signup error:', error);
    } finally {
        showLoading(false);
    }
}

async function handleLogout() {
    try {
        await authFunctions.logout(auth);
        showToast('Logged out');
        showPage('login');
        // Cleanup listeners
        if (state.feedListener) state.feedListener();
        if (state.profileListener) state.profileListener();
        if (state.chatListener) state.chatListener();
        if (state.reelsListener) state.reelsListener();
        if (state.notificationListener) state.notificationListener();
    } catch (error) {
        console.error('Logout error:', error);
    }
}

async function handleForgotPassword() {
    const username = document.getElementById('loginUsername').value.trim().toLowerCase();
    if (!username) {
        document.getElementById('loginError').textContent = 'Enter your username first';
        return;
    }
    try {
        await authFunctions.resetPassword(auth, usernameToEmail(username));
        showToast('Password reset link sent! 📧');
    } catch (error) {
        document.getElementById('loginError').textContent = 'User not found';
    }
}

// ============================================================
// AUTH STATE OBSERVER - REAL TIME PROFILE
// ============================================================
authFunctions.onAuthStateChanged(auth, async (user) => {
    if (user) {
        state.currentUser = user;
        state.currentUid = user.uid;
        
        // Check if blocked
        const userSnap = await firestore.getDoc(firestore.doc(db, 'users', user.uid));
        if (userSnap.exists() && userSnap.data().status === 'BLOCKED') {
            document.getElementById('blockedAccountOverlay').classList.add('show');
            return;
        }
        
        document.getElementById('blockedAccountOverlay').classList.remove('show');
        
        // Real-time profile update listener
        if (state.profileListener) state.profileListener();
        state.profileListener = firestore.onSnapshot(
            firestore.doc(db, 'users', user.uid),
            (snap) => {
                if (snap.exists()) {
                    const data = snap.data();
                    // Update profile photo in header
                    document.getElementById('myStoryAvatar').src = data.profilePhoto || 'assets/default-profile.png';
                    // Update notification badge
                    // Update any other real-time UI elements
                }
            }
        );
        
        if (state.currentPage === 'login' || state.currentPage === 'signup') {
            showPage('home');
        }
    } else {
        state.currentUser = null;
        state.currentUid = null;
        if (state.profileListener) state.profileListener();
        if (state.currentPage !== 'login' && state.currentPage !== 'signup') {
            showPage('login');
        }
    }
});

// ============================================================
// HOME FEED
// ============================================================
function loadFeed() {
    const feed = document.getElementById('feedContainer');
    if (!feed) return;

    if (state.feedListener) state.feedListener();

    const q = firestore.query(
        firestore.collection(db, 'posts'),
        firestore.orderBy('createdAt', 'desc')
    );
    
    state.feedListener = firestore.onSnapshot(q, (snapshot) => {
        feed.innerHTML = '';
        if (snapshot.empty) {
            feed.innerHTML = '<p class="statusMessage">No posts yet. Be the first to post! 🚀</p>';
            return;
        }

        snapshot.forEach((docSnap) => {
            const post = docSnap.data();
            const postId = docSnap.id;
            const isVideo = isUrlVideo(post.media);
            const mediaTag = isVideo
                ? `<video src="${post.media}" style="width:100%;height:100%;object-fit:cover;" controls></video>`
                : `<img src="${post.media}" style="width:100%;height:100%;object-fit:cover;">`;
            const avatar = post.profilePhoto || 'assets/default-profile.png';

            feed.innerHTML += `
                <div class="postCard" data-id="${postId}">
                    <div class="postHeader">
                        <div class="postUser" onclick="viewProfile('${post.uid}')">
                            <img class="postProfile" src="${avatar}">
                            <div>
                                <h4 class="postUsername">${post.username}</h4>
                                <p class="postMeta">${formatTime(post.createdAt)}</p>
                            </div>
                        </div>
                        <button class="postMenu"><i class="fa-solid fa-ellipsis-vertical"></i></button>
                    </div>
                    <div class="postMedia" onclick="viewPost('${postId}')">${mediaTag}</div>
                    <div class="postActions">
                        <div class="leftActions">
                            <button class="likeBtn" onclick="handleLike('${postId}')">
                                <i class="fa-regular fa-heart"></i> <span>${formatNumber(post.likes || 0)}</span>
                            </button>
                            <button onclick="viewPost('${postId}')">
                                <i class="fa-regular fa-comment"></i> <span>${formatNumber(post.comments || 0)}</span>
                            </button>
                            <button onclick="sharePost('${postId}')">
                                <i class="fa-regular fa-paper-plane"></i>
                            </button>
                        </div>
                        <button onclick="savePost('${postId}')"><i class="fa-regular fa-bookmark"></i></button>
                    </div>
                    <div class="postInfo">
                        <p class="caption"><span>${post.username}</span> ${post.caption || ''}</p>
                        <p class="viewComments" onclick="viewPost('${postId}')">View all comments</p>
                        <p class="postTime">${formatTime(post.createdAt)}</p>
                    </div>
                </div>
            `;
        });
    }, (error) => {
        console.error('Feed error:', error);
    });
}

window.handleLike = async function(postId) {
    if (!state.currentUid) return;
    try {
        await firestore.updateDoc(firestore.doc(db, 'posts', postId), {
            likes: firestore.increment(1)
        });
    } catch (error) {
        console.error('Like error:', error);
    }
};

window.viewPost = function(postId) {
    showPage('post');
    // Load single post view
    loadSinglePost(postId);
};

window.viewProfile = function(uid) {
    showPage('profile');
    loadProfile(uid);
};

window.sharePost = function(postId) {
    const url = window.location.origin + '?post=' + postId;
    if (navigator.share) {
        navigator.share({ title: 'VibeTube Post', url });
    } else {
        navigator.clipboard.writeText(url);
        showToast('Link copied!');
    }
};

window.savePost = function(postId) {
    showToast('⭐ Post saved!');
};

// ============================================================
// SINGLE POST VIEW
// ============================================================
function loadSinglePost(postId) {
    const container = document.getElementById('singlePostContainer');
    if (!container) return;

    const postRef = firestore.doc(db, 'posts', postId);
    firestore.onSnapshot(postRef, (docSnap) => {
        if (!docSnap.exists()) {
            container.innerHTML = '<p class="statusMessage">Post not found</p>';
            return;
        }
        const post = docSnap.data();
        const isVideo = isUrlVideo(post.media);
        const mediaTag = isVideo
            ? `<video class="postMedia" src="${post.media}" controls autoplay muted></video>`
            : `<img class="postMedia" src="${post.media}">`;

        container.innerHTML = `
            <div class="postCard">
                <div class="postUserHeader">
                    <div class="postUser" onclick="viewProfile('${post.uid}')">
                        <img class="postProfile" src="${post.profilePhoto || 'assets/default-profile.png'}">
                        <div><h4 class="postUsername">${post.username}</h4><p class="postMeta">${formatTime(post.createdAt)}</p></div>
                    </div>
                    <button class="postMenu"><i class="fa-solid fa-ellipsis-vertical"></i></button>
                </div>
                <div class="postMediaContainer">${mediaTag}</div>
                <div class="postActions">
                    <div class="leftActions">
                        <button onclick="handleLike('${postId}')"><i class="fa-solid fa-heart" style="color:#ef4444;"></i> <span>${formatNumber(post.likes || 0)}</span></button>
                        <button><i class="fa-regular fa-comment"></i> <span>${formatNumber(post.comments || 0)}</span></button>
                        <button onclick="sharePost('${postId}')"><i class="fa-regular fa-paper-plane"></i></button>
                    </div>
                    <button onclick="savePost('${postId}')"><i class="fa-regular fa-bookmark"></i></button>
                </div>
                <div class="postInfo"><p class="caption"><span>${post.username}</span> ${post.caption || ''}</p></div>
            </div>
        `;
    });
}

// ============================================================
// PROFILE - REAL TIME
// ============================================================
let profileUid = null;

async function loadProfile(uid) {
    if (!uid) uid = state.currentUid;
    profileUid = uid;

    showLoading(true);

    try {
        const userSnap = await firestore.getDoc(firestore.doc(db, 'users', uid));
        if (!userSnap.exists()) {
            showToast('User not found');
            showLoading(false);
            return;
        }

        const user = userSnap.data();
        document.getElementById('pUsername').textContent = user.username || 'user';
        document.getElementById('pFullName').textContent = user.name || 'No Name';
        document.getElementById('pBio').textContent = user.bio || 'No Bio Yet';
        document.getElementById('pProfilePhoto').src = user.profilePhoto || 'assets/default-profile.png';
        document.getElementById('pCoverPhoto').src = user.coverPhoto || 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=800';
        document.getElementById('pPosts').textContent = user.posts || 0;
        document.getElementById('pFollowers').textContent = formatNumber(user.followers || 0);
        document.getElementById('pFollowing').textContent = formatNumber(user.following || 0);

        // Edit button visibility
        const editBtn = document.getElementById('pEditProfile');
        if (uid === state.currentUid) {
            editBtn.style.display = 'block';
            editBtn.onclick = () => showPage('settings');
        } else {
            editBtn.style.display = 'none';
        }

        loadUserPosts(uid);
    } catch (error) {
        console.error('Profile load error:', error);
    } finally {
        showLoading(false);
    }
}

function loadUserPosts(uid) {
    const grid = document.getElementById('pProfileGrid');
    if (!grid) return;

    const q = firestore.query(
        firestore.collection(db, 'posts'),
        firestore.where('uid', '==', uid),
        firestore.orderBy('createdAt', 'desc')
    );

    firestore.onSnapshot(q, (snapshot) => {
        grid.innerHTML = '';
        if (snapshot.empty) {
            grid.innerHTML = '<p class="no-content">No posts yet 📷</p>';
            return;
        }
        snapshot.forEach((docSnap) => {
            const post = docSnap.data();
            const isVideo = isUrlVideo(post.media);
            grid.innerHTML += `
                <div class="gridItem" onclick="viewPost('${docSnap.id}')">
                    ${isVideo ? `<video src="${post.media}" muted></video>` : `<img src="${post.media}">`}
                </div>
            `;
        });
    });
}

// ============================================================
// SEARCH
// ============================================================
let searchTimeout = null;

function initSearch() {
    const input = document.getElementById('searchInput');
    const container = document.getElementById('resultsContainer');

    input.oninput = () => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(async () => {
            const query = input.value.trim().toLowerCase();
            if (!query) {
                container.innerHTML = '<p class="statusMessage">Type a username to discover creators ✨</p>';
                return;
            }

            try {
                const q = firestore.query(
                    firestore.collection(db, 'users'),
                    firestore.orderBy('username'),
                    firestore.where('username', '>=', query),
                    firestore.where('username', '<=', query + '\uf8ff')
                );
                const snap = await firestore.getDocs(q);
                container.innerHTML = '';
                if (snap.empty) {
                    container.innerHTML = `<p class="statusMessage">No creators found matching "${query}" 🔍</p>`;
                    return;
                }
                snap.forEach((docSnap) => {
                    const user = docSnap.data();
                    container.innerHTML += `
                        <div class="userCard" onclick="viewProfile('${docSnap.id}')">
                            <div class="userInfo">
                                <img class="userAvatar" src="${user.profilePhoto || 'assets/default-profile.png'}">
                                <div class="userText">
                                    <h4>@${user.username}</h4>
                                    <p>${user.name || 'VibeTube Creator'}</p>
                                </div>
                            </div>
                            <i class="fa-solid fa-chevron-right" style="color:#27272a;"></i>
                        </div>
                    `;
                });
            } catch (error) {
                console.error('Search error:', error);
            }
        }, 300);
    };
}

// ============================================================
// CHATS - REAL TIME
// ============================================================
function loadChatList() {
    const list = document.getElementById('chatList');
    if (!list) return;

    if (state.chatListener) state.chatListener();

    const q = firestore.collection(db, 'users');
    state.chatListener = firestore.onSnapshot(q, (snapshot) => {
        list.innerHTML = '';
        let hasUsers = false;

        snapshot.forEach((docSnap) => {
            const user = docSnap.data();
            const uid = docSnap.id;
            if (uid === state.currentUid) return;
            hasUsers = true;

            list.innerHTML += `
                <div class="userRow" onclick="openChat('${uid}', '${user.username}', '${user.profilePhoto || 'assets/default-profile.png'}')">
                    <img class="rowAvatar" src="${user.profilePhoto || 'assets/default-profile.png'}">
                    <div class="rowDetails">
                        <h4>@${user.username}</h4>
                        <p>${user.name || 'Tap to chat...'}</p>
                    </div>
                </div>
            `;
        });

        if (!hasUsers) {
            list.innerHTML = '<p class="statusMessage">No users to chat with 💬</p>';
        }
    });
}

window.openChat = function(uid, username, avatar) {
    state.activeChatTarget = uid;
    document.getElementById('chatName').textContent = '@' + username;
    document.getElementById('chatAvatar').src = avatar || 'assets/default-profile.png';
    document.getElementById('chatOverlay').classList.add('active');
    
    listenToMessages(uid);
    document.getElementById('messageInput').value = '';
    document.getElementById('messageInput').focus();
};

function listenToMessages(targetUid) {
    if (state.messagesListener) state.messagesListener();

    const roomId = state.currentUid < targetUid ? 
        `${state.currentUid}_${targetUid}` : `${targetUid}_${state.currentUid}`;
    
    const q = firestore.query(
        firestore.collection(db, 'chats', roomId, 'messages'),
        firestore.orderBy('time', 'asc')
    );

    state.messagesListener = firestore.onSnapshot(q, (snapshot) => {
        const area = document.getElementById('messagesArea');
        area.innerHTML = '';
        if (snapshot.empty) {
            area.innerHTML = '<p class="statusMessage">No messages yet. Say hello! 👋</p>';
            return;
        }
        snapshot.forEach((docSnap) => {
            const msg = docSnap.data();
            const isMe = msg.senderId === state.currentUid;
            area.innerHTML += `
                <div class="msgBubble ${isMe ? 'outgoing' : 'incoming'}">
                    ${msg.message}
                    <span class="msgTime">${formatTime(msg.time)}</span>
                </div>
            `;
        });
        area.scrollTop = area.scrollHeight;
    });
}

async function sendMessage() {
    const input = document.getElementById('messageInput');
    const text = input.value.trim();
    if (!text || !state.activeChatTarget) return;

    input.value = '';
    const roomId = state.currentUid < state.activeChatTarget ? 
        `${state.currentUid}_${state.activeChatTarget}` : `${state.activeChatTarget}_${state.currentUid}`;

    try {
        await firestore.addDoc(firestore.collection(db, 'chats', roomId, 'messages'), {
            senderId: state.currentUid,
            receiverId: state.activeChatTarget,
            message: text,
            type: 'text',
            seen: false,
            time: firestore.serverTimestamp()
        });
    } catch (error) {
        console.error('Send message error:', error);
        showToast('Error sending message');
    }
}

// ============================================================
// REELS - WITH AD REWARDS
// ============================================================
let reelsData = [];

function loadReels() {
    const container = document.getElementById('reelsContainer');
    if (!container) return;

    if (state.reelsListener) state.reelsListener();

    const q = firestore.query(
        firestore.collection(db, 'posts'),
        firestore.orderBy('createdAt', 'desc')
    );
    
    state.reelsListener = firestore.onSnapshot(q, (snapshot) => {
        container.innerHTML = '';
        reelsData = [];
        let hasReels = false;

        snapshot.forEach((docSnap) => {
            const post = docSnap.data();
            if (isUrlVideo(post.media)) {
                hasReels = true;
                reelsData.push({ id: docSnap.id, ...post });
                container.innerHTML += `
                    <div class="reelSection" data-id="${docSnap.id}">
                        <video class="reelVideo" src="${post.media}" loop playsinline></video>
                        <div class="reelActions">
                            <button class="actionBtn likeBtn" onclick="handleReelLike('${docSnap.id}')">
                                <i class="fa-solid fa-heart"></i>
                                <span>${formatNumber(post.likes || 0)}</span>
                            </button>
                            <button class="actionBtn"><i class="fa-solid fa-comment"></i><span>${formatNumber(post.comments || 0)}</span></button>
                            <button class="actionBtn" onclick="sharePost('${docSnap.id}')"><i class="fa-solid fa-share"></i><span>Share</span></button>
                        </div>
                        <div class="reelInfo">
                            <div class="reelUser" onclick="viewProfile('${post.uid}')">
                                <img src="${post.profilePhoto || 'assets/default-profile.png'}">
                                <h4>@${post.username}</h4>
                            </div>
                            <p class="reelCaption">${post.caption || ''}</p>
                        </div>
                    </div>
                `;
            }
        });

        if (!hasReels) {
            container.innerHTML = '<p class="statusMessage" style="padding-top:100px;">No Reels Uploaded Yet 🎬</p>';
            return;
        }

        setupReelPlayback();
        loadUserPoints();
    });
}

function setupReelPlayback() {
    const videos = document.querySelectorAll('.reelVideo');
    if (videos.length > 0) videos[0].play();

    const container = document.getElementById('reelsContainer');
    container.onscroll = () => {
        const scrollTop = container.scrollTop;
        const height = container.clientHeight;
        const index = Math.round(scrollTop / height);
        
        videos.forEach((video, i) => {
            if (i === index) {
                if (video.paused) video.play();
                checkAdTrigger();
            } else {
                video.pause();
            }
        });
    };

    videos.forEach(v => {
        v.onclick = () => {
            if (v.paused) v.play();
            else v.pause();
        };
    });
}

let viewedReelsCount = 0;
let nextAdTrigger = Math.floor(Math.random() * 3) + 7;

function checkAdTrigger() {
    viewedReelsCount++;
    if (viewedReelsCount >= nextAdTrigger) {
        viewedReelsCount = 0;
        nextAdTrigger = Math.floor(Math.random() * 3) + 7;
        showAdPopup();
    }
}

function showAdPopup() {
    document.getElementById('adPopup').classList.add('show');
    document.querySelectorAll('.reelVideo').forEach(v => v.pause());
}

window.handleReelLike = async function(postId) {
    try {
        await firestore.updateDoc(firestore.doc(db, 'posts', postId), {
            likes: firestore.increment(1)
        });
    } catch (error) {
        console.error('Reel like error:', error);
    }
};

async function loadUserPoints() {
    const userSnap = await firestore.getDoc(firestore.doc(db, 'users', state.currentUid));
    if (userSnap.exists()) {
        document.getElementById('reelsPoints').textContent = userSnap.data().points || 0;
    }
}

// ============================================================
// AD REWARD
// ============================================================
document.getElementById('watchAdBtn')?.addEventListener('click', async () => {
    const btn = document.getElementById('watchAdBtn');
    btn.disabled = true;
    btn.textContent = 'Loading...';

    setTimeout(async () => {
        const points = Math.floor(Math.random() * 51) + 10;
        try {
            await firestore.updateDoc(firestore.doc(db, 'users', state.currentUid), {
                points: firestore.increment(points)
            });
            showToast(`🎉 Earned +${points} Points!`);
            loadUserPoints();
        } catch (error) {
            console.error('Ad reward error:', error);
        } finally {
            document.getElementById('adPopup').classList.remove('show');
            btn.disabled = false;
            btn.textContent = 'Watch Ad';
            document.querySelectorAll('.reelVideo').forEach(v => v.play());
        }
    }, 3000);
});

// ============================================================
// CREATE POST - WITH CLOUDINARY/IMGBB
// ============================================================
function initCreatePost() {
    const uploadZone = document.getElementById('uploadZone');
    const fileInput = document.getElementById('mediaFileInput');
    const preview = document.getElementById('previewContainer');
    const mediaBox = document.getElementById('mediaBox');
    const removeBtn = document.getElementById('removePreviewBtn');
    const caption = document.getElementById('postCaption');
    const charCount = document.getElementById('charCount');
    const shareBtn = document.getElementById('sharePostBtn');

    uploadZone.onclick = () => fileInput.click();

    fileInput.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        state.selectedFile = file;
        const url = URL.createObjectURL(file);
        mediaBox.innerHTML = file.type.startsWith('image/') 
            ? `<img class="previewMedia" src="${url}">`
            : `<video class="previewMedia" src="${url}" controls muted autoplay></video>`;
        uploadZone.style.display = 'none';
        preview.classList.add('active');
    };

    removeBtn.onclick = () => {
        state.selectedFile = null;
        fileInput.value = '';
        mediaBox.innerHTML = '';
        preview.classList.remove('active');
        uploadZone.style.display = 'flex';
    };

    caption.oninput = () => {
        charCount.textContent = caption.value.length;
    };

    shareBtn.onclick = async () => {
        if (!state.selectedFile || !state.currentUid) {
            showToast('Please select media first!');
            return;
        }

        shareBtn.disabled = true;
        showLoading(true);

        try {
            // Upload to Cloudinary or ImgBB
            const mediaUrl = await uploadMedia(state.selectedFile);

            const userSnap = await firestore.getDoc(firestore.doc(db, 'users', state.currentUid));
            const userData = userSnap.exists() ? userSnap.data() : {};

            await firestore.addDoc(firestore.collection(db, 'posts'), {
                uid: state.currentUid,
                username: userData.username || 'vibetube_user',
                profilePhoto: userData.profilePhoto || '',
                media: mediaUrl,
                caption: caption.value.trim(),
                likes: 0, comments: 0, shares: 0, saves: 0,
                createdAt: firestore.serverTimestamp()
            });

            await firestore.updateDoc(firestore.doc(db, 'users', state.currentUid), {
                posts: firestore.increment(1)
            });

            showToast('Post published! 🎉');
            showPage('home');
        } catch (error) {
            console.error('Upload error:', error);
            showToast('Upload failed: ' + error.message);
        } finally {
            shareBtn.disabled = false;
            showLoading(false);
        }
    };
}

// ============================================================
// NOTIFICATIONS
// ============================================================
function loadNotifications() {
    const list = document.getElementById('notificationsList');
    if (!list) return;

    if (state.notificationListener) state.notificationListener();

    const q = firestore.query(
        firestore.collection(db, 'notifications'),
        firestore.where('targetUid', '==', state.currentUid),
        firestore.orderBy('createdAt', 'desc')
    );

    state.notificationListener = firestore.onSnapshot(q, (snapshot) => {
        list.innerHTML = '';
        if (snapshot.empty) {
            list.innerHTML = '<p class="statusMessage">All caught up! ✨</p>';
            return;
        }
        snapshot.forEach((docSnap) => {
            const item = docSnap.data();
            list.innerHTML += `
                <div class="notificationCard">
                    <div class="cardLeft">
                        <div class="avatarWrapper">
                            <img class="notificationAvatar" src="${item.senderProfilePhoto || 'assets/default-profile.png'}">
                        </div>
                        <div class="cardText">
                            <strong>@${item.senderUsername}</strong> ${item.text || 'interacted with you'}
                            <span class="notificationTime">${formatTime(item.createdAt)}</span>
                        </div>
                    </div>
                </div>
            `;
        });
    });
}

// ============================================================
// SETTINGS
// ============================================================
function initSettings() {
    document.getElementById('triggerPasswordRow').onclick = () => {
        document.getElementById('passwordFormBlock').classList.toggle('active');
    };

    document.getElementById('updatePasswordBtn').onclick = async () => {
        const current = document.getElementById('currentPasswordInput').value;
        const newPass = document.getElementById('newPasswordInput').value;
        if (!current || !newPass) {
            showToast('Please fill all fields');
            return;
        }
        if (newPass.length < 6) {
            showToast('Password must be at least 6 characters');
            return;
        }

        showLoading(true);
        try {
            const credential = authFunctions.EmailAuthProvider.credential(state.currentUser.email, current);
            await authFunctions.reauthenticate(state.currentUser, credential);
            await authFunctions.updatePassword(state.currentUser, newPass);
            showToast('Password updated! 🔐');
            document.getElementById('passwordFormBlock').classList.remove('active');
            document.getElementById('currentPasswordInput').value = '';
            document.getElementById('newPasswordInput').value = '';
        } catch (error) {
            showToast('Error: ' + error.message);
        } finally {
            showLoading(false);
        }
    };

    document.getElementById('logoutBtnRow').onclick = async () => {
        if (confirm('Logout from VibeTube?')) {
            await handleLogout();
        }
    };

    document.getElementById('deleteBtnRow').onclick = async () => {
        if (!confirm('⚠️ Delete account permanently? This cannot be undone!')) return;
        const password = prompt('Enter your password to confirm:');
        if (!password) return;

        showLoading(true);
        try {
            const credential = authFunctions.EmailAuthProvider.credential(state.currentUser.email, password);
            await authFunctions.reauthenticate(state.currentUser, credential);
            await firestore.deleteDoc(firestore.doc(db, 'users', state.currentUid));
            await authFunctions.deleteUser(state.currentUser);
            showToast('Account deleted. Goodbye! 👋');
            showPage('login');
        } catch (error) {
            showToast('Error: ' + error.message);
        } finally {
            showLoading(false);
        }
    };
}

// ============================================================
// WALLET
// ============================================================
async function loadWallet() {
    const userSnap = await firestore.getDoc(firestore.doc(db, 'users', state.currentUid));
    if (!userSnap.exists()) return;

    const user = userSnap.data();
    const points = user.points || 0;
    const inr = (points / 1700) * 60;

    document.getElementById('walletPoints').textContent = points;
    document.getElementById('walletBalance').textContent = inr.toFixed(2);

    const statusEl = document.getElementById('adUnlockStatus');
    const statusText = document.getElementById('statusText');
    if (user.userIndex <= 200 || (user.followers || 0) >= 300) {
        statusEl.className = 'unlock-status unlocked';
        statusText.textContent = 'Rewarded Ads: Unlocked 🎉';
    } else {
        statusEl.className = 'unlock-status locked';
        statusText.textContent = `Ads Locked! Need 300 followers (You have ${user.followers || 0})`;
    }

    loadWithdrawHistory();
}

function loadWithdrawHistory() {
    const container = document.getElementById('historyContainer');
    const q = firestore.query(
        firestore.collection(db, 'withdraws'),
        firestore.where('uid', '==', state.currentUid),
        firestore.orderBy('createdAt', 'desc')
    );

    firestore.onSnapshot(q, (snapshot) => {
        container.innerHTML = '';
        if (snapshot.empty) {
            container.innerHTML = '<p class="no-history">No payout history yet</p>';
            return;
        }
        snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            container.innerHTML += `
                <div class="history-item">
                    <div>
                        <strong>₹${data.amount}</strong> (${data.method})
                        <br><small style="color:#71717a">${formatTime(data.createdAt)}</small>
                    </div>
                    <span class="status-${data.status.toLowerCase()}">${data.status}</span>
                </div>
            `;
        });
    });
}

document.getElementById('submitWithdrawBtn')?.addEventListener('click', async () => {
    const amount = parseFloat(document.getElementById('withdrawAmount').value);
    const method = document.getElementById('paymentMethod').value;
    const details = document.getElementById('paymentDetails').value.trim();

    if (!amount || amount <= 0 || !details) {
        showToast('Please enter valid details');
        return;
    }

    const userSnap = await firestore.getDoc(firestore.doc(db, 'users', state.currentUid));
    const points = userSnap.data()?.points || 0;
    const inrBalance = (points / 1700) * 60;

    if (amount > inrBalance) {
        showToast('Insufficient balance!');
        return;
    }

    const isFirst = userSnap.data()?.isFirstWithdraw !== false;
    if (isFirst && amount < 300) {
        showToast('First withdrawal must be minimum ₹300!');
        return;
    }

    try {
        await firestore.addDoc(firestore.collection(db, 'withdraws'), {
            uid: state.currentUid,
            amount: amount,
            method: method,
            details: details,
            status: 'PENDING',
            createdAt: firestore.serverTimestamp()
        });
        showToast('Withdrawal request submitted! ⏳');
        document.getElementById('withdrawAmount').value = '';
        document.getElementById('paymentDetails').value = '';
    } catch (error) {
        showToast('Error: ' + error.message);
    }
});

// ============================================================
// HIDDEN CHATS
// ============================================================
async function checkHiddenChatStatus() {
    const userSnap = await firestore.getDoc(firestore.doc(db, 'users', state.currentUid));
    if (!userSnap.exists()) return;

    const user = userSnap.data();
    if (user.hiddenChatPin) {
        document.getElementById('lockScreen').classList.add('show');
        document.getElementById('setPasswordScreen').classList.remove('show');
        document.getElementById('hiddenChatsContent').classList.remove('show');
        document.getElementById('lockPinInput').focus();
    } else {
        document.getElementById('setPasswordScreen').classList.add('show');
        document.getElementById('lockScreen').classList.remove('show');
        document.getElementById('hiddenChatsContent').classList.remove('show');
        document.getElementById('setPinInput').focus();
    }
}

document.getElementById('setPinBtn').onclick = async () => {
    const pin = document.getElementById('setPinInput').value.trim();
    const confirm = document.getElementById('confirmPinInput').value.trim();

    if (!pin || !confirm) {
        document.getElementById('setPinError').textContent = 'Please fill both fields';
        return;
    }
    if (pin.length !== 4 || !/^\d{4}$/.test(pin)) {
        document.getElementById('setPinError').textContent = 'PIN must be exactly 4 digits';
        return;
    }
    if (pin !== confirm) {
        document.getElementById('setPinError').textContent = 'PINs don\'t match';
        return;
    }

    try {
        await firestore.updateDoc(firestore.doc(db, 'users', state.currentUid), {
            hiddenChatPin: pin,
            hiddenChats: []
        });
        showToast('PIN set successfully! 🔐');
        document.getElementById('setPasswordScreen').classList.remove('show');
        document.getElementById('hiddenChatsContent').classList.add('show');
        loadHiddenChats();
    } catch (error) {
        document.getElementById('setPinError').textContent = 'Error: ' + error.message;
    }
};

document.getElementById('unlockBtn').onclick = async () => {
    const pin = document.getElementById('lockPinInput').value.trim();
    if (!pin || pin.length !== 4) {
        document.getElementById('lockError').textContent = 'Enter 4-digit PIN';
        return;
    }

    const userSnap = await firestore.getDoc(firestore.doc(db, 'users', state.currentUid));
    if (!userSnap.exists()) return;

    if (pin === userSnap.data().hiddenChatPin) {
        document.getElementById('lockError').textContent = '';
        document.getElementById('lockScreen').classList.remove('show');
        document.getElementById('hiddenChatsContent').classList.add('show');
        loadHiddenChats();
    } else {
        state.pinAttempts++;
        const remaining = state.MAX_PIN_ATTEMPTS - state.pinAttempts;
        document.getElementById('lockError').textContent = `Wrong PIN! ${remaining} attempts remaining`;
        if (state.pinAttempts >= state.MAX_PIN_ATTEMPTS) {
            document.getElementById('lockError').textContent = 'Too many attempts. Logging out...';
            setTimeout(() => handleLogout(), 2000);
        }
    }
};

document.getElementById('forgotPinBtn').onclick = () => {
    if (confirm('Reset PIN? This will remove all hidden chats!')) {
        firestore.updateDoc(firestore.doc(db, 'users', state.currentUid), {
            hiddenChatPin: null,
            hiddenChats: []
        }).then(() => {
            showToast('PIN reset. Set a new one.');
            checkHiddenChatStatus();
        }).catch(error => showToast('Error: ' + error.message));
    }
};

async function loadHiddenChats() {
    const list = document.getElementById('hiddenChatList');
    const userSnap = await firestore.getDoc(firestore.doc(db, 'users', state.currentUid));
    if (!userSnap.exists()) return;

    const hiddenIds = userSnap.data().hiddenChats || [];
    list.innerHTML = '';

    if (hiddenIds.length === 0) {
        list.innerHTML = `
            <div class="emptyHiddenChats">
                <i class="fa-solid fa-lock"></i>
                <h4>No Hidden Chats</h4>
                <p>Add a chat to your hidden list to keep it private.</p>
                <button class="addHiddenBtn" onclick="window.addHiddenChat()">
                    <i class="fa-solid fa-plus"></i> Add Hidden Chat
                </button>
            </div>
        `;
        return;
    }

    for (const uid of hiddenIds) {
        const userSnap2 = await firestore.getDoc(firestore.doc(db, 'users', uid));
        if (!userSnap2.exists()) continue;
        const user = userSnap2.data();
        list.innerHTML += `
            <div class="hiddenUserRow" onclick="openHiddenChat('${uid}', '${user.username}', '${user.profilePhoto || 'assets/default-profile.png'}')">
                <img class="rowAvatar" src="${user.profilePhoto || 'assets/default-profile.png'}">
                <div class="rowDetails">
                    <h4>@${user.username} <span class="lockBadge"><i class="fa-solid fa-lock"></i></span></h4>
                    <p>${user.name || 'Tap to chat'}</p>
                </div>
            </div>
        `;
    }
}

window.addHiddenChat = async function() {
    const username = prompt('Enter username to add to hidden chats:');
    if (!username) return;

    try {
        const q = firestore.query(
            firestore.collection(db, 'users'),
            firestore.where('username', '==', username.toLowerCase().trim())
        );
        const snap = await firestore.getDocs(q);
        if (snap.empty) {
            showToast('User not found!');
            return;
        }
        const targetUid = snap.docs[0].id;
        if (targetUid === state.currentUid) {
            showToast('Cannot add yourself!');
            return;
        }

        const userSnap = await firestore.getDoc(firestore.doc(db, 'users', state.currentUid));
        const hidden = userSnap.data().hiddenChats || [];
        if (hidden.includes(targetUid)) {
            showToast('Already in hidden chats!');
            return;
        }

        await firestore.updateDoc(firestore.doc(db, 'users', state.currentUid), {
            hiddenChats: firestore.arrayUnion(targetUid)
        });
        showToast('Added to hidden chats! 🔒');
        loadHiddenChats();
    } catch (error) {
        showToast('Error: ' + error.message);
    }
};

function openHiddenChat(uid, username, avatar) {
    state.activeHiddenChatTarget = uid;
    document.getElementById('hiddenChatName').textContent = '@' + username;
    document.getElementById('hiddenChatAvatar').src = avatar || 'assets/default-profile.png';
    document.getElementById('hiddenChatOverlay').classList.add('active');
    listenToHiddenMessages(uid);
    document.getElementById('hiddenMessageInput').value = '';
    document.getElementById('hiddenMessageInput').focus();
}

function listenToHiddenMessages(targetUid) {
    if (state.hiddenMessagesListener) state.hiddenMessagesListener();

    const roomId = state.currentUid < targetUid ? 
        `${state.currentUid}_${targetUid}` : `${targetUid}_${state.currentUid}`;
    
    const q = firestore.query(
        firestore.collection(db, 'chats', roomId, 'messages'),
        firestore.orderBy('time', 'asc')
    );

    state.hiddenMessagesListener = firestore.onSnapshot(q, (snapshot) => {
        const area = document.getElementById('hiddenMessagesArea');
        area.innerHTML = '';
        if (snapshot.empty) {
            area.innerHTML = '<p class="statusMessage">No private messages yet</p>';
            return;
        }
        snapshot.forEach((docSnap) => {
            const msg = docSnap.data();
            const isMe = msg.senderId === state.currentUid;
            area.innerHTML += `
                <div class="msgBubble ${isMe ? 'outgoing' : 'incoming'}">
                    ${msg.message}
                    <span class="msgTime">${formatTime(msg.time)}</span>
                </div>
            `;
        });
        area.scrollTop = area.scrollHeight;
    });
}

async function sendHiddenMessage() {
    const input = document.getElementById('hiddenMessageInput');
    const text = input.value.trim();
    if (!text || !state.activeHiddenChatTarget) return;

    input.value = '';
    const roomId = state.currentUid < state.activeHiddenChatTarget ? 
        `${state.currentUid}_${state.activeHiddenChatTarget}` : 
        `${state.activeHiddenChatTarget}_${state.currentUid}`;

    try {
        await firestore.addDoc(firestore.collection(db, 'chats', roomId, 'messages'), {
            senderId: state.currentUid,
            receiverId: state.activeHiddenChatTarget,
            message: text,
            type: 'text',
            seen: false,
            time: firestore.serverTimestamp()
        });
    } catch (error) {
        showToast('Error sending message');
    }
}

// ============================================================
// STORY VIEWER - WITH CLOUDINARY/IMGBB
// ============================================================
async function openStoryViewer() {
    const viewer = document.getElementById('storyViewer');
    viewer.classList.add('show');

    try {
        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const q = firestore.query(
            firestore.collection(db, 'stories'),
            firestore.where('createdAt', '>=', twentyFourHoursAgo),
            firestore.orderBy('createdAt', 'asc')
        );
        const snap = await firestore.getDocs(q);
        state.storiesList = snap.docs.map(d => ({ id: d.id, ...d.data() }));

        if (state.storiesList.length === 0) {
            document.getElementById('storyViewerMediaBox').innerHTML = 
                '<p style="color:#71717a;">No stories available</p>';
            return;
        }

        state.storyIndex = 0;
        showStoryItem(0);
    } catch (error) {
        console.error('Story error:', error);
    }
}

function closeStoryViewer() {
    document.getElementById('storyViewer').classList.remove('show');
    clearInterval(state.storyInterval);
}

function showStoryItem(index) {
    if (index < 0 || index >= state.storiesList.length) {
        closeStoryViewer();
        return;
    }

    clearInterval(state.storyInterval);
    const story = state.storiesList[index];
    const isVideo = isUrlVideo(story.mediaUrl);

    document.getElementById('storyViewerUsername').textContent = '@' + story.username;
    document.getElementById('storyViewerAvatar').src = story.profilePhoto || 'assets/default-profile.png';

    const mediaBox = document.getElementById('storyViewerMediaBox');
    mediaBox.innerHTML = isVideo
        ? `<video id="storyVideo" src="${story.mediaUrl}" autoplay muted playsinline style="width:100%;height:100%;object-fit:cover;"></video>`
        : `<img src="${story.mediaUrl}" style="width:100%;height:100%;object-fit:cover;">`;

    const progress = document.getElementById('storyProgress');
    progress.innerHTML = state.storiesList.map((_, i) => `
        <div class="bar"><div class="fill" style="width:${i < index ? '100%' : '0%'}"></div></div>
    `).join('');

    const duration = isVideo ? 10000 : 4000;
    const fill = progress.querySelectorAll('.fill')[index];
    let width = 0;
    const step = 100 / (duration / 100);

    state.storyInterval = setInterval(() => {
        width += step;
        if (fill) fill.style.width = Math.min(width, 100) + '%';
        if (width >= 100) {
            clearInterval(state.storyInterval);
            state.storyIndex++;
            showStoryItem(state.storyIndex);
        }
    }, 100);
}

document.getElementById('storyNavLeft').onclick = () => {
    state.storyIndex--;
    showStoryItem(state.storyIndex);
};
document.getElementById('storyNavRight').onclick = () => {
    state.storyIndex++;
    showStoryItem(state.storyIndex);
};

document.getElementById('storyAddBtn').onclick = () => {
    document.getElementById('storyFileInput').click();
};

document.getElementById('storyFileInput').onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    showLoading(true);
    try {
        // Upload to Cloudinary or ImgBB
        const url = await uploadMedia(file);

        const userSnap = await firestore.getDoc(firestore.doc(db, 'users', state.currentUid));
        const user = userSnap.data();

        await firestore.addDoc(firestore.collection(db, 'stories'), {
            uid: state.currentUid,
            username: user.username || 'user',
            profilePhoto: user.profilePhoto || '',
            mediaUrl: url,
            createdAt: firestore.serverTimestamp()
        });

        showToast('Story posted! 🌅');
        closeStoryViewer();
    } catch (error) {
        showToast('Error: ' + error.message);
    } finally {
        showLoading(false);
    }
};

// ============================================================
// EVENT BINDINGS
// ============================================================
document.getElementById('loginBtn').onclick = handleLogin;
document.getElementById('signupBtn').onclick = handleSignup;
document.getElementById('goToSignupBtn').onclick = () => showPage('signup');
document.getElementById('goToLoginBtn').onclick = () => showPage('login');
document.getElementById('forgotPasswordBtn').onclick = handleForgotPassword;

document.getElementById('createPostBtn').onclick = () => showPage('create');
document.getElementById('notificationBtn').onclick = () => showPage('notification');
document.getElementById('profileMenuBtn').onclick = () => showPage('settings');

document.getElementById('sendMessageBtn').onclick = sendMessage;
document.getElementById('messageInput').onkeypress = (e) => {
    if (e.key === 'Enter') sendMessage();
};
document.getElementById('closeChatBtn').onclick = () => {
    document.getElementById('chatOverlay').classList.remove('active');
    if (state.messagesListener) state.messagesListener();
};

document.getElementById('sendHiddenMessageBtn').onclick = sendHiddenMessage;
document.getElementById('hiddenMessageInput').onkeypress = (e) => {
    if (e.key === 'Enter') sendHiddenMessage();
};
document.getElementById('closeHiddenChat').onclick = () => {
    document.getElementById('hiddenChatOverlay').classList.remove('active');
    if (state.hiddenMessagesListener) state.hiddenMessagesListener();
    loadHiddenChats();
};
document.getElementById('addHiddenChatBtn').onclick = window.addHiddenChat;
document.getElementById('lockSettingsBtn').onclick = () => {
    const newPin = prompt('Enter new 4-digit PIN:');
    if (newPin && /^\d{4}$/.test(newPin)) {
        firestore.updateDoc(firestore.doc(db, 'users', state.currentUid), { hiddenChatPin: newPin })
            .then(() => {
                showToast('PIN changed! 🔐');
                checkHiddenChatStatus();
            })
            .catch(error => showToast('Error: ' + error.message));
    } else if (newPin !== null) {
        showToast('PIN must be 4 digits');
    }
};

document.getElementById('blockedLogoutBtn').onclick = handleLogout;

document.getElementById('clearAllBtn').onclick = async () => {
    if (!confirm('Clear all notifications?')) return;
    try {
        const q = firestore.query(
            firestore.collection(db, 'notifications'),
            firestore.where('targetUid', '==', state.currentUid)
        );
        const snap = await firestore.getDocs(q);
        const batch = firestore.writeBatch(db);
        snap.forEach(d => batch.delete(d.ref));
        await batch.commit();
        showToast('Cleared! 🧹');
    } catch (error) {
        showToast('Error: ' + error.message);
    }
};

document.getElementById('pShareProfile').onclick = () => {
    const url = window.location.origin + '?profile=' + state.currentUid;
    if (navigator.share) {
        navigator.share({ title: 'VibeTube Profile', url });
    } else {
        navigator.clipboard.writeText(url);
        showToast('Profile link copied!');
    }
};

// ============================================================
// KEYBOARD SHORTCUTS
// ============================================================
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        if (document.getElementById('chatOverlay').classList.contains('active')) {
            document.getElementById('closeChatBtn').click();
        }
        if (document.getElementById('hiddenChatOverlay').classList.contains('active')) {
            document.getElementById('closeHiddenChat').click();
        }
        if (document.getElementById('storyViewer').classList.contains('show')) {
            closeStoryViewer();
        }
    }
});

// ============================================================
// INITIALIZATION
// ============================================================
initCreatePost();
initSettings();

// Expose functions globally
window.openStoryViewer = openStoryViewer;
window.closeStoryViewer = closeStoryViewer;
window.loadProfile = loadProfile;

console.log('🚀 VibeTube App Loaded Successfully!');
console.log('📸 Media Upload: Cloudinary + ImgBB');
console.log('📱 All features: Login, Signup, Feed, Profile, Search, Chats, Reels, Stories, Wallet, Settings, Hidden Chats');
console.log('🔄 Real-time profile updates enabled');
