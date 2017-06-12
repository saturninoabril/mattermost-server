// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See License.txt for license information.

import PostStore from 'stores/post_store.jsx';
import {queuePost} from 'actions/post_actions.jsx';
import Constants from 'utils/constants.jsx';
import WebSocketClient from 'client/web_websocket_client.jsx';

import {FormattedMessage} from 'react-intl';
import PropTypes from 'prop-types';
import React from 'react';

export default class PendingPostOptions extends React.Component {
    constructor(props) {
        super(props);

        this.retryPost = this.retryPost.bind(this);
        this.cancelPost = this.cancelPost.bind(this);

        this.submitting = false;

        this.state = {};
    }
    retryPost(e) {
        e.preventDefault();

        console.log("RETRY POST");

        // if (this.submitting || !WebSocketClient.isOpen()) {
        //     return;
        // }

        if (this.submitting) {
            console.log("retryPost SUBMITTING this.props.post: ", this.props.post);
            return;
        }

        console.log("retryPost WebSocketClient.isClosed(): ", WebSocketClient.isClosed());
        // if (!WebSocketClient.isClosed()) {
        //     console.log("retryPost WS NOT OPEN this.props.post: ", this.props.post);
        //     return;
        // }

        this.submitting = true;

        var post = this.props.post;
        console.log("retryPost post: ", post);
        console.log("retryPost queuePost");
        queuePost(post, true, null,
            (err) => {
                if (err.id === 'api.post.create_post.root_id.app_error') {
                    this.showPostDeletedModal();
                } else {
                    this.forceUpdate();
                }

                this.submitting = false;
            }
        );

        post.state = Constants.POST_LOADING;
        console.log("retryPost after queuePost post: ", post);
        PostStore.updatePendingPost(post);
        this.forceUpdate();
        console.log("retryPost SUBMIT ==> POST_LOADING ==>", "POST: ", post);
    }
    cancelPost(e) {
        e.preventDefault();

        var post = this.props.post;
        PostStore.removePendingPost(post.channel_id, post.pending_post_id);
        this.forceUpdate();
    }
    render() {
        return (<span className='pending-post-actions'>
            <a
                className='post-retry'
                href='#'
                onClick={this.retryPost}
            >
                <FormattedMessage
                    id='pending_post_actions.retry'
                    defaultMessage='Retry'
                />
            </a>
            {' - '}
            <a
                className='post-cancel'
                href='#'
                onClick={this.cancelPost}
            >
                <FormattedMessage
                    id='pending_post_actions.cancel'
                    defaultMessage='Cancel'
                />
            </a>
        </span>);
    }
}

PendingPostOptions.propTypes = {
    post: PropTypes.object
};
