// Copyright (c) 2016 Mattermost, Inc. All Rights Reserved.
// See License.txt for license information.

import AppDispatcher from 'dispatcher/app_dispatcher.jsx';

import ChannelStore from 'stores/channel_store.jsx';
import PostStore from 'stores/post_store.jsx';
import TeamStore from 'stores/team_store.jsx';
import UserStore from 'stores/user_store.jsx';

import {loadStatusesForChannel} from 'actions/status_actions.jsx';

import Client from 'client/web_client.jsx';
import * as AsyncClient from 'utils/async_client.jsx';

import Constants from 'utils/constants.jsx';
const ActionTypes = Constants.ActionTypes;
const Preferences = Constants.Preferences;

export function handleNewPost(post, msg) {
    const teamId = TeamStore.getCurrentId();

    if (ChannelStore.getCurrentId() === post.channel_id) {
        if (window.isActive) {
            AsyncClient.viewChannel();
        } else {
            AsyncClient.getChannel(post.channel_id);
        }
    } else if (msg && (teamId === msg.data.team_id || msg.data.channel_type === Constants.DM_CHANNEL)) {
        if (Client.teamId) {
            AsyncClient.getChannel(post.channel_id);
        }
    }

    let websocketMessageProps = null;
    if (msg) {
        websocketMessageProps = msg.data;
    }

    const myTeams = TeamStore.getMyTeamMembers();
    if (msg.data.team_id !== teamId && myTeams.filter((m) => m.team_id === msg.data.team_id).length) {
        AsyncClient.getMyTeamsUnread(teamId);
    }

    if (post.root_id && PostStore.getPost(post.channel_id, post.root_id) == null) {
        Client.getPost(
            post.channel_id,
            post.root_id,
            (data) => {
                AppDispatcher.handleServerAction({
                    type: ActionTypes.RECEIVED_POSTS,
                    id: post.channel_id,
                    numRequested: 0,
                    post_list: data
                });

                // Required to update order
                AppDispatcher.handleServerAction({
                    type: ActionTypes.RECEIVED_POST,
                    post,
                    websocketMessageProps
                });

                loadProfilesForPosts(data.posts);
            },
            (err) => {
                AsyncClient.dispatchError(err, 'getPost');
            }
        );

        return;
    }

    AppDispatcher.handleServerAction({
        type: ActionTypes.RECEIVED_POST,
        post,
        websocketMessageProps
    });
}

export function setUnreadPost(channelId, postId) {
    console.log(`setUnreadPost: channelId: ${channelId}, postId: ${postId}`);
    let lastViewed = 0;
    let ownNewMessage = false;
    const post = PostStore.getPost(channelId, postId);
    const posts = PostStore.getVisiblePosts(channelId).posts;
    const currentChannel = ChannelStore.getCurrent();
    // console.log(`setUnreadPost: currentChannel: ${currentChannel}`);
    var currentUsedId = UserStore.getCurrentId();
    // console.log(`setUnreadPost: currentUsedId: ${currentUsedId}`);
    // if (currentUsedId === post.user_id || PostUtils.isSystemMessage(post)) {
    //     for (const otherPostId in posts) {
    //         if (lastViewed < posts[otherPostId].create_at && currentUsedId !== posts[otherPostId].user_id && !PostUtils.isSystemMessage(posts[otherPostId])) {
    //             lastViewed = posts[otherPostId].create_at;
    //         }
    //     }
    //     if (lastViewed === 0) {
    //         lastViewed = Number.MAX_VALUE;
    //     } else if (lastViewed > post.create_at) {
    //         lastViewed = post.create_at - 1;
    //         ownNewMessage = true;
    //     } else {
    //         lastViewed -= 1;
    //     }
    // } else {
    //     lastViewed = post.create_at - 1;
    // }

    // if (lastViewed === Number.MAX_VALUE) {
    //     AsyncClient.updateLastViewedAt();
    //     ChannelStore.resetCounts(ChannelStore.getCurrentId());
    //     ChannelStore.emitChange();
    // } else {
    //     let unreadPosts = 0;
    //     for (const otherPostId in posts) {
    //         if (posts[otherPostId].create_at > lastViewed) {
    //             unreadPosts += 1;
    //         }
    //     }

    //     // Temporary workaround for DM channels having wrong unread values
    //     if (currentChannel.type === Constants.DM_CHANNEL) {
    //         unreadPosts = 0;
    //     }

    //     const member = ChannelStore.getMember(channelId);
    //     const channel = ChannelStore.get(channelId);
    //     member.last_viewed_at = lastViewed;
    //     member.msg_count = channel.total_msg_count - unreadPosts;
    //     member.mention_count = 0;
    //     ChannelStore.storeMyChannelMember(member);
    //     ChannelStore.setUnreadCountByChannel(channelId);
    //     AsyncClient.setLastViewedAt(lastViewed, channelId);
    // }

    // DEBUG
    lastViewed = 0;

    if (channelId === ChannelStore.getCurrentId()) {
        console.log(`setUnreadPost: channelId === ChannelStore: ${channelId === ChannelStore.getCurrentId()}`);
        ChannelStore.emitLastViewed(lastViewed);
    }
}

export function flagPost(postId) {
    AsyncClient.savePreference(Preferences.CATEGORY_FLAGGED_POST, postId, 'true');
}

export function unflagPost(postId, success) {
    const pref = {
        user_id: UserStore.getCurrentId(),
        category: Preferences.CATEGORY_FLAGGED_POST,
        name: postId
    };
    AsyncClient.deletePreferences([pref], success);
}

export function getFlaggedPosts() {
    Client.getFlaggedPosts(0, Constants.POST_CHUNK_SIZE,
        (data) => {
            AppDispatcher.handleServerAction({
                type: ActionTypes.RECEIVED_SEARCH_TERM,
                term: null,
                do_search: false,
                is_mention_search: false
            });

            AppDispatcher.handleServerAction({
                type: ActionTypes.RECEIVED_SEARCH,
                results: data,
                is_flagged_posts: true
            });

            loadProfilesForPosts(data.posts);
        },
        (err) => {
            AsyncClient.dispatchError(err, 'getFlaggedPosts');
        }
    );
}

export function loadPosts(channelId = ChannelStore.getCurrentId(), isPost = false) {
    const postList = PostStore.getAllPosts(channelId);
    const latestPostTime = PostStore.getLatestPostFromPageTime(channelId);

    if (
        !postList || Object.keys(postList).length === 0 ||
        (!isPost && postList.order.length < Constants.POST_CHUNK_SIZE) ||
        latestPostTime === 0
    ) {
        loadPostsPage(channelId, Constants.POST_CHUNK_SIZE, isPost);
        return;
    }

    Client.getPosts(
        channelId,
        latestPostTime,
        (data) => {
            AppDispatcher.handleServerAction({
                type: ActionTypes.RECEIVED_POSTS,
                id: channelId,
                before: true,
                numRequested: 0,
                post_list: data,
                isPost
            });

            loadProfilesForPosts(data.posts);
            loadStatusesForChannel(channelId);
        },
        (err) => {
            AsyncClient.dispatchError(err, 'loadPosts');
        }
    );
}

export function loadPostsPage(channelId = ChannelStore.getCurrentId(), max = Constants.POST_CHUNK_SIZE, isPost = false) {
    const postList = PostStore.getAllPosts(channelId);

    // if we already have more than POST_CHUNK_SIZE posts,
    //   let's get the amount we have but rounded up to next multiple of POST_CHUNK_SIZE,
    //   with a max
    let numPosts = Math.min(max, Constants.POST_CHUNK_SIZE);
    if (postList && postList.order.length > 0) {
        numPosts = Math.min(max, Constants.POST_CHUNK_SIZE * Math.ceil(postList.order.length / Constants.POST_CHUNK_SIZE));
    }

    Client.getPostsPage(
        channelId,
        0,
        numPosts,
        (data) => {
            AppDispatcher.handleServerAction({
                type: ActionTypes.RECEIVED_POSTS,
                id: channelId,
                before: true,
                numRequested: numPosts,
                checkLatest: true,
                checkEarliest: true,
                post_list: data,
                isPost
            });

            loadProfilesForPosts(data.posts);
            loadStatusesForChannel(channelId);
        },
        (err) => {
            AsyncClient.dispatchError(err, 'loadPostsPage');
        }
    );
}

export function loadPostsBefore(postId, offset, numPost, isPost) {
    const channelId = ChannelStore.getCurrentId();
    if (channelId == null) {
        return;
    }

    Client.getPostsBefore(
        channelId,
        postId,
        offset,
        numPost,
        (data) => {
            AppDispatcher.handleServerAction({
                type: ActionTypes.RECEIVED_POSTS,
                id: channelId,
                before: true,
                checkEarliest: true,
                numRequested: numPost,
                post_list: data,
                isPost
            });

            loadProfilesForPosts(data.posts);
            loadStatusesForChannel(channelId);
        },
        (err) => {
            AsyncClient.dispatchError(err, 'loadPostsBefore');
        }
    );
}

export function loadPostsAfter(postId, offset, numPost, isPost) {
    const channelId = ChannelStore.getCurrentId();
    if (channelId == null) {
        return;
    }

    Client.getPostsAfter(
        channelId,
        postId,
        offset,
        numPost,
        (data) => {
            AppDispatcher.handleServerAction({
                type: ActionTypes.RECEIVED_POSTS,
                id: channelId,
                before: false,
                numRequested: numPost,
                post_list: data,
                isPost
            });

            loadProfilesForPosts(data.posts);
            loadStatusesForChannel(channelId);
        },
        (err) => {
            AsyncClient.dispatchError(err, 'loadPostsAfter');
        }
    );
}

export function loadProfilesForPosts(posts) {
    const profilesToLoad = {};
    for (const pid in posts) {
        if (!posts.hasOwnProperty(pid)) {
            continue;
        }

        const post = posts[pid];
        if (!UserStore.hasProfile(post.user_id)) {
            profilesToLoad[post.user_id] = true;
        }
    }

    const list = Object.keys(profilesToLoad);
    if (list.length === 0) {
        return;
    }

    AsyncClient.getProfilesByIds(list);
}

export function addReaction(channelId, postId, emojiName) {
    const reaction = {
        post_id: postId,
        user_id: UserStore.getCurrentId(),
        emoji_name: emojiName
    };

    AsyncClient.saveReaction(channelId, reaction);
}

export function removeReaction(channelId, postId, emojiName) {
    const reaction = {
        post_id: postId,
        user_id: UserStore.getCurrentId(),
        emoji_name: emojiName
    };

    AsyncClient.deleteReaction(channelId, reaction);
}

const postQueue = [];

export function queuePost(post, doLoadPost, success, error) {
    postQueue.push(
        createPost.bind(
            this,
            post,
            doLoadPost,
            (data) => {
                if (success) {
                    success(data);
                }

                postSendComplete();
            },
            (err) => {
                if (error) {
                    error(err);
                }

                postSendComplete();
            }
        )
    );

    sendFirstPostInQueue();
}

// Remove the completed post from the queue and send the next one
function postSendComplete() {
    postQueue.shift();
    sendNextPostInQueue();
}

// Start sending posts if a new queue has started
function sendFirstPostInQueue() {
    if (postQueue.length === 1) {
        sendNextPostInQueue();
    }
}

// Send the next post in the queue if there is one
function sendNextPostInQueue() {
    const nextPostAction = postQueue[0];
    if (nextPostAction) {
        nextPostAction();
    }
}

export function createPost(post, doLoadPost, success, error) {
    Client.createPost(post,
        (data) => {
            if (doLoadPost) {
                loadPosts(post.channel_id);
            } else {
                PostStore.removePendingPost(post.pending_post_id);
            }

            AppDispatcher.handleServerAction({
                type: ActionTypes.RECEIVED_POST,
                post: data
            });

            if (success) {
                success(data);
            }
        },

        (err) => {
            if (err.id === 'api.post.create_post.root_id.app_error') {
                PostStore.removePendingPost(post.pending_post_id);
            } else {
                post.state = Constants.POST_FAILED;
                PostStore.updatePendingPost(post);
            }

            if (error) {
                error(err);
            }
        }
    );
}

export function updatePost(post, success, isPost) {
    Client.updatePost(
        post,
        () => {
            loadPosts(post.channel_id, isPost);

            if (success) {
                success();
            }
        },
        (err) => {
            AsyncClient.dispatchError(err, 'updatePost');
        });
}

export function removePostFromStore(post) {
    PostStore.removePost(post);
    PostStore.emitChange();
}

export function deletePost(channelId, post, success, error) {
    Client.deletePost(
        channelId,
        post.id,
        () => {
            removePostFromStore(post);
            if (post.id === PostStore.getSelectedPostId()) {
                AppDispatcher.handleServerAction({
                    type: ActionTypes.RECEIVED_POST_SELECTED,
                    postId: null
                });
            }

            if (success) {
                success();
            }
        },
        (err) => {
            AsyncClient.dispatchError(err, 'deletePost');

            if (error) {
                error(err);
            }
        }
    );
}

export function performSearch(terms, isMentionSearch, success, error) {
    Client.search(
        terms,
        isMentionSearch,
        (data) => {
            AppDispatcher.handleServerAction({
                type: ActionTypes.RECEIVED_SEARCH,
                results: data,
                is_mention_search: isMentionSearch
            });

            loadProfilesForPosts(data.posts);

            if (success) {
                success(data);
            }
        },
        (err) => {
            AsyncClient.dispatchError(err, 'search');

            if (error) {
                error(err);
            }
        }
    );
}
