/**
 * @fileOverview The wiki read controller.
 */

var HP, SESSION_HISTORY_USER_MAP, SESSION_HISTORY_TS, SESSION_HISTORY_PREV,
  SESSION_HISTORY_NEXT, SESSION_FROM_DIFF, SESSION_TO_DIFF, VIEW_TYPE_EDIT,
  VIEW_TYPE_DIFF, SESSION_VIEW_DIFF, DIRECTION_TO, DIRECTION_FROM,
  PREVIOUS_FROM, NEXT_TO, SESSION_IS_PREV_SHORTCUT, SESSION_IS_NEXT_SHORTCUT,
  SESSION_RESTORE_SUCCESS, SESSION_RESTORE_FAILED;

/**
 * @type {string}
 * @const
 */
SESSION_RESTORE_SUCCESS = 'history-restore-success';

/**
 * @type {string}
 * @const
 */
SESSION_RESTORE_FAILED = 'history-restore-failed';

/**
 * @type {string}
 * @const
 */
NEXT_TO = 'next';

/**
 * @type {string}
 * @const
 */
PREVIOUS_FROM = 'previous';

/**
 * @type {string}
 * @const
 */
DIRECTION_FROM = 'from';

/**
 * @type {string}
 * @const
 */
DIRECTION_TO = 'to';

/**
 * @type {string}
 * @const
 */
SESSION_VIEW_DIFF = 'history-view-diff';

/**
 * @type {string}
 * @const
 */
VIEW_TYPE_EDIT = 'edit';

/**
 * @type {string}
 * @const
 */
VIEW_TYPE_DIFF = 'diff';

/**
 * @type {string}
 * @const
 */
SESSION_FROM_DIFF = 'history-from-diff';

/**
 * @type {string}
 * @const
 */
SESSION_TO_DIFF = 'history-to-diff';

/**
 * @type {string}
 * @const
 */
SESSION_HISTORY_PREV = 'history-previous';

/**
 * @type {string}
 * @const
 */
SESSION_HISTORY_NEXT = 'history-next';

/**
 * @type {string}
 * @const
 */
SESSION_HISTORY_USER_MAP = 'history-user-map';

/**
 * @type {string}
 * @const
 */
SESSION_HISTORY_TS = 'history-timestamp';

/**
 * @constructor
 * @extends {View}
 */
function History_() {
  this.init_();
}
History_.prototype = _.clone(View);
HP = History_.prototype;

/**
 * @type {string}
 */
HP.name = 'history';

/**
 * @param {string} pageName
 * @param {string} viewType
 * @param {string=} opt_ts
 * @param {string=} opt_toTs
 * @protected
 * @return {string}
 */
HP.pathGenerator_ = function(pageName, viewType, opt_ts, opt_toTs) {
  var args;
  args = [this.name, pageName];
  if (_.isUndefined(viewType)) {
    return args.join('/');
  }
  if (_.isUndefined(opt_toTs)) {
    return [this.name, pageName, viewType, opt_ts].join('/');
  }
  return [this.name, pageName, viewType, opt_ts, opt_toTs].join('/');
};

/**
 * @param {Object} state
 * @param {string} viewName
 * @param {string} pageName
 * @param {string} viewType
 * @param {string=} opt_ts Timestamp for which edit to show.
 * @param {string=} opt_toTs Timestamp for which to use for to in a diff.
 * @protected
 */
HP.render = function(state, viewName, pageName, viewType, opt_ts, opt_toTs) {
  var from, to, result;
  Session.set(SESSION_PAGE_NAME_KEY, pageName);
  Session.set(SESSION_PAGE_TYPE, viewName);
  if (viewType === VIEW_TYPE_EDIT && !_.isUndefined(opt_ts)) {
    Session.set(SESSION_HISTORY_TS, parseInt(opt_ts, 10));
    return;
  } else {
    Session.set(SESSION_HISTORY_TS, null);
  }
  if (viewType === VIEW_TYPE_DIFF && !_.isUndefined(opt_ts) &&
      !_.isUndefined(opt_toTs)) {
    /**
     * What follows is some what convoluted logic that allows for the
     * 'previous' and 'next' shortcuts in URLS when wanting to see diffs.
     * XXX: Put in separate function?
     */
    if (opt_ts === PREVIOUS_FROM) {
      Session.set(SESSION_IS_PREV_SHORTCUT, true);
      to = parseInt(opt_toTs, 10);
      if (!to) {
        Session.set(SESSION_VIEW_DIFF, false);
        return;
      }
      from = getOpposite(to, true);
    } else {
      from = parseInt(opt_ts, 10);
      if (!from) {
        Session.set(SESSION_VIEW_DIFF, false);
        return;
      }
      if (opt_toTs === NEXT_TO) {
        Session.set(SESSION_IS_NEXT_SHORTCUT, true);
        to = getOpposite(from, false);
      } else {
        to = parseInt(opt_toTs, 10);
      }
    }
    Session.set(SESSION_FROM_DIFF, from);
    Session.set(SESSION_TO_DIFF, to);
    Session.set(SESSION_VIEW_DIFF, true);
  } else {
    Session.set(SESSION_VIEW_DIFF, false);
  }
};

/**
 * @param {number} other
 * @param {boolean} fromTo
 * @return {number}
 */
function getOpposite(other, fromTo) {
  var opposite; 
  result = previousAndNextForTs(other);
  if (!result) {
    return other;
  }
  if (fromTo) {
    opposite = result.previous;
  } else {
    opposite = result.next;
  }
  if (!opposite) {
    return other;
  }
  return opposite.ts;
}

/** @inheritDoc */
HP.dispose = function() {
  Session.set(SESSION_HISTORY_TS, null);
  Session.set(SESSION_VIEW_DIFF, false);
  Session.set(SESSION_IS_PREV_SHORTCUT, false);
  Session.set(SESSION_IS_NEXT_SHORTCUT, false);
  Session.set(SESSION_TO_DIFF, undefined);
  Session.set(SESSION_FROM_DIFF, undefined);
};

History = History_;

Meteor.startup(function() {
  // In startup because it uses createProfileFetcher, defined elsewhere.
  Deps.autorun(createProfileFetcher(HP.name, SESSION_HISTORY_USER_MAP,
    'historyProfiles', WikiEdits));
});

Deps.autorun(function() {
  var result;
  result = previousAndNextForTs(Session.get(SESSION_HISTORY_TS));
  Session.set(SESSION_HISTORY_PREV, result.previous ? result.previous.ts : null);
  Session.set(SESSION_HISTORY_NEXT, result.next ? result.next.ts : null);
});

/**
 * @param {number} ts
 * @return {Object}
 */
function previousAndNextForTs(ts) {
  var edits, previous, next, found, ts;
  edits = WikiEdits.find({pageId: pageId()}, {sort: {ts: 1}});
  edits.forEach(function(edit) {
    if (edit.ts === ts) {
      found = true;
      return;
    }
    if (!found) {
      previous = edit;
      return;
    }
    if (!next) {
      next = edit;
    }
  });
  return {previous: previous, next: next};
}

/**
 * return {string}
 */
Template.history.pageTitle = function() {
  return formattedPageName();
};

/**
 * @return {string}
 */
Template.history.restoreError = function() {
  return Session.get(SESSION_RESTORE_FAILED);
};

/**
 * @return {boolean=}
 */
Template.history.hasRestoreSuccess = function() {
  return Session.get(SESSION_RESTORE_SUCCESS);
};

/**
 * @return {Array}
 */
Template.history.edits = function() {
  var edits;
  edits = [];
  WikiEdits.find({pageId: pageId()}, {sort: {ts: -1}}).forEach(function(edit) {
    var data, userMap;
    userMap = Session.get(SESSION_HISTORY_USER_MAP) || {};
    data = {
      ts: edit.ts,
      deleted: edit.deleted,
      pageId: pageName(),
      date: new Date(edit.ts).toLocaleString(),
      createdBy: profileInfo(edit.createdBy, userMap),
      publishedBy: profileInfo(edit.publishedBy, userMap),
      comment: edit.comment
    }
    edits.push(data);
  });
  return edits;
};

/**
 * @param {number} ts
 * @Param {Object} options
 * @return {boolean}
 */
Template.history.isFrom = function (ts, options) {
  var result;
  result = ifSameAsSession(ts, SESSION_FROM_DIFF, options);
  return result;
};

/**
 * @param {number} ts
 * @Param {Object} options
 * @return {boolean}
 */
Template.history.isTo = function (ts, options) {
  var result;
  result = ifSameAsSession(ts, SESSION_TO_DIFF, options);
  return result;
};

Template.history.events({
  // quick fix, need to integrate this properly
  'click a.internal-profile-link': function(event) {
    var el, user_id;
    event.preventDefault();

    el = $(event.target);
    userId = el.data('id');

    window.router.run('profile', [userId],
      [{}, 'profile', userId]);
  },  
  'click a.internal-link': function(event) {
    if (!$(event.target).hasClass('internal-profile-link'))
          handleHistoryInternalLink(event);
  },
  'submit #history-compare-form': handleCompareSubmit,
  'change input.to-input': handleToChange,
  'change input.from-input': handleFromChange
});

/**
 * @return {boolean}
 */
Template.historicalEdit.showHistoricalEdit = function() {
  return !_.isNull(Session.get(SESSION_HISTORY_TS));
};

/**
 * @return {string}
 */
Template.historicalEdit.data = function() {
  var edit, userMap, page;
  userMap = Session.get(SESSION_HISTORY_USER_MAP) || {};
  edit = WikiEdits.findOne({ts: Session.get(SESSION_HISTORY_TS)});
  if (!edit) {
    return {formattedContent: 'Not found.'};
  }

  page = WikiPages.findOne({name: edit.pageName});
  edit = Extensions.runHookChain('render',
    { edit: edit, page: page }).edit;

  return {
    author: profileInfo(edit.createdBy, userMap),
    date: new Date(edit.ts).toLocaleString(),
    deleted: edit.deleted,
    comment: edit.comment,
    formattedContent: edit.formattedContent,
    id: edit._id,
    canRestore: canRestore(edit)
  };
};
// Extensions.registerHookType('render', '1.0.0') in read.js

/**
 * @param {Object} edit
 * @return {boolean}
 */
function canRestore(edit) {
  var p;
  if (edit.deleted) {
    return false;
  }
  p = WikiPages.findOne(pageId());
  return edit._id !== p.lastEditId;
}

/**
 * @return {number}
 */
Template.historicalEdit.previous = function() {
  return Session.get(SESSION_HISTORY_PREV);
};

/**
 * @return {number}
 */
Template.historicalEdit.next = function() {
  return Session.get(SESSION_HISTORY_NEXT);
};

Template.historicalEdit.events({
  'click a.internal-action': handleHistoryInternalAction
});

/**
 * @return {boolean}
 */
Template.historicalDiff.showHistoricalDiff = function() {
  return Session.get(SESSION_VIEW_DIFF);
};

/**
 * @return {Object}
 */
Template.historicalDiff.diffFromNav = function() {
  return getDiffNav(SESSION_FROM_DIFF, DIRECTION_FROM);
};

/**
 * @return {Object}
 */
Template.historicalDiff.diffToNav = function() {
  return getDiffNav(SESSION_TO_DIFF, DIRECTION_TO);
};

/**
 * @return {string}
 */
Template.historicalDiff.diff = function() {
  var diff, fromTs, toTs, from, to;
  fromTs = Session.get(SESSION_FROM_DIFF);
  toTs = Session.get(SESSION_TO_DIFF);
  if (!fromTs || !toTs) {
    return null;
  }
  if (fromTs === toTs) {
    if (Session.get(SESSION_IS_PREV_SHORTCUT)) {
      fromTs = getOpposite(toTs, true);
      Session.set(SESSION_FROM_DIFF, fromTs);
    } else if (Session.get(SESSION_IS_NEXT_SHORTCUT)) {
      toTs = getOpposite(toTs, false);
      Session.set(SESSION_TO_DIFF, fromTs);
    }
  }
  from = WikiEdits.findOne({ts: fromTs});
  to = WikiEdits.findOne({ts: toTs});
  if (!from || !to) {
    return null;
  }
  return JsDiff.diffWords(from.content, to.content);
};

Template.historicalDiff.events({
  'click a.internal-action': handleHistoryInternalAction
});

/**
 * @param {string} sessionKey
 * @param {string} direction
 * return {Object}
 */
function getDiffNav(sessionKey, direction) {
  var edit, ts, userMap, result, name;
  ts = Session.get(sessionKey);
  name = pageName();
  edit = WikiEdits.findOne({ts: ts});
  if (!edit) {
    return {};
  }
  userMap = Session.get(SESSION_HISTORY_USER_MAP) || {};
  result = previousAndNextForTs(edit.ts);
  return {
    previous: result.previous ? result.previous.ts : null,
    next: result.next ? result.next.ts : null,
    who: profileInfo(edit.createdBy, userMap),
    what: {
      ts: edit.ts,
      date: new Date(edit.ts).toLocaleString(),
      deleted: edit.deleted,
      pageId: name
    },
    direction: direction
  };
}

/**
 * @param {Object} event
 */
function handleHistoryInternalAction(event) {
  var type, name;
  name = pageName();
  event.preventDefault();
  type = $(event.target).attr('data-action');
  if (type === 'close') {
    window.router.run('history', [name], [{}, 'history', name]);
  }
  if (type === 'previous' || type === 'next') {
    handleHistoryNavEvent(event);
  }
  if (type === 'diff-previous' || type === 'diff-next') {
    handleHistoryDiffNavEvent(event);
  }
  if (type === 'restore') {
    handleRestoreNavEvent(event);
  }
};

/**
 * @param {Object} event
 */
function handleRestoreNavEvent(event) {
  var id, name, edit;
  id = $(event.target).attr('data-id');
  edit = WikiEdits.findOne({_id: id});
  if (!edit) {
    return;
  }
  name = pageName();
  if (name !== edit.pageName) {
    return;
  }
  Meteor.call('edit', pageId(), name, edit.content, 'Reverted.',
    _.partial(handleRestore, name));
}

/**
 * @param {string} name
 * @param {Object} error
 * @param {Object} response
 */
function handleRestore(name, error, response) {
  var msg;
  if (error || !response || !response.success) {
    Sessison.set(SESSION_RESTORE_SUCCESS, undefined);
    msg = response.error || 'Failed to restore edit.';
    Session.set(SESSION_RESTORE_FAILED, msg);
  } else {
    Session.set(SESSION_RESTORE_FAILED, undefined);
    Session.set(SESSION_RESTORE_SUCCESS, true);
  }
  window.router.run('history', [name], [{}, 'history', name]);
}

/**
 * @param {Object} event
 */
function handleToChange(event) {
  handleDiffSelection(event, SESSION_TO_DIFF, SESSION_FROM_DIFF);
}

/**
 * @param {Object} event
 */
function handleFromChange(event) {
  handleDiffSelection(event, SESSION_FROM_DIFF, SESSION_TO_DIFF);
}

/**
 * @param {Object} event
 * @param {string} setSessionKey
 * @param {string} checkSessionKey
 */
function handleDiffSelection(event, setSessionKey, checkSessionKey) {
  var el, ts;
  el = $(event.target);
  ts = parseInt(el.attr('data-ts'), 10);
  if (ts === Session.get(checkSessionKey)) {
    event.preventDefault();
    el.removeAttr('checked');
    return;
  }
  if (setSessionKey === SESSION_TO_DIFF) {
    if (ts < Session.get(checkSessionKey)) {
      Session.set(setSessionKey, Session.get(checkSessionKey));
      Session.set(checkSessionKey, ts);
      return;
    }
  } else {
    if (ts > Session.get(checkSessionKey)) {
      Session.set(setSessionKey, Session.get(checkSessionKey));
      Session.set(checkSessionKey, ts);
      return;
    }
  }
  Session.set(setSessionKey, ts);
}

/**
 * @param {Object} event
 */
function handleCompareSubmit(event) {
  var to, from, name;
  event.preventDefault();
  to = Session.get(SESSION_TO_DIFF);
  from = Session.get(SESSION_FROM_DIFF);
  name = pageName();
  window.router.run('history', [name, VIEW_TYPE_DIFF, from, to], [{}, 'history',
    name, VIEW_TYPE_DIFF, from, to]);
}


/**
 * @param {Object} event
 */
function handleHistoryInternalLink(event) {
  var el, type;
  el = $(event.target);
  type = el.attr('data-type');
  if (type === 'history') {
    event.preventDefault();
    handleHistoryNavEvent(event);
  }
}

/**
 * @param {Object} event
 */
function handleHistoryNavEvent(event) {
  var el, ts, name;
  el = $(event.target);
  ts = parseInt(el.attr('data-ts'), 10);
  if (ts) {
    name = pageName();
    window.router.run('history', [name, VIEW_TYPE_EDIT, ts], [{}, 'history',
      name, VIEW_TYPE_EDIT, ts]);
  }
}

/**
 * @param {Object} event
 */
function handleHistoryDiffNavEvent(event) {
  var el, ts, name, direction, from, to;
  el = $(event.target);
  ts = parseInt(el.attr('data-ts'), 10);
  direction = el.attr('data-direction');
  if (!ts || !direction) {
    return;
  }
  if (direction === DIRECTION_FROM) {
    if (ts >= Session.get(SESSION_TO_DIFF)) {
      /*
       * Shouldn't compare same or reverse diffs, although still possible via
       * URL.
       */
      return;
    }
    Session.set(SESSION_FROM_DIFF, ts);
  } else {
    if (ts <= Session.get(SESSION_FROM_DIFF)) {
      // Same.
      return;
    }
    Session.set(SESSION_TO_DIFF, ts);
  }
  name = pageName();
  from = Session.get(SESSION_FROM_DIFF);
  to = Session.get(SESSION_TO_DIFF);
  window.router.run('history', [name, VIEW_TYPE_DIFF, from, to], [{}, 'history',
    name, VIEW_TYPE_DIFF, from, to]);
}
