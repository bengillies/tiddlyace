/*
 *
 * main entry point for TiddlyACE
 *
 * TiddlyACE integrates TiddlySpace with the Ace IDE (https://github.com/ajaxorg/ace)
 *
 * TiddlyACE itself written by Ben Gillies
 *
 * Dependencies: jQuery, Ace, chrjs, jQueryUI, chrjs.store
 */

/*global tiddlyweb jQuery window document ace require*/

window.tiddlyace = (function($) {

if (window.Worker) {
	window.Worker = undefined; // TODO: Hacky. Remove this when https://github.com/ajaxorg/ace/issues/245 is fixed
}

var TiddlyWikiMode = false,
	// mappings for dealing with different types of tiddlers
	languages = {
		javascript: {
			type: 'text/javascript',
			tags: ['systemConfig']
		},
		html: {
			type: 'text/html',
			tags: []
		},
		css: {
			type: 'text/css',
			tags: []
		},
		svg: {
			type: 'image/svg+xml',
			tags: []
		},
		other: {
			type: '',
			tags: []
		}
	},
	store = tiddlyweb.Store(),

	// match the tiddler content type (tiddler.type) up with the appropriate key in languages
	getTiddlerType = function(tiddler) {
		var mimeType = (tiddler && tiddler.type) ? tiddler.type :
				'other',
			result = 'other';
		$.each(languages, function(type, info) {
			if (mimeType === info.type) {
				result = type;
			}
		});
		return result;
	},

	// new tab window
	newWindow = function(type, name) {
		var id = type + '_' + String(Math.random()).slice(2);
		$('#workingArea').tabs('add', '#' + id, name);
	},

	switchToTab = function(name) {
		var hashID = $('#tabList a').map(function(i, el) {
			return ($(el).text() === name) ? el : null;
		}).attr('href');
		$('#workingArea').tabs('select', hashID);
	},

	// all tiddlers currently open in a tab
	openTiddlers = {},

	// open a tiddler in a new tab with its own ace editor, creating it first if necessary
	openTiddler = function(type, name, bag) {
		if (openTiddlers[name]) {
			switchToTab(name);
		} else {
			// tiddlers are skinny by default, so get the fat version
			store.getTiddler(name, function(tiddler) {
				if (!tiddler) {
					tiddler = new tiddlyweb.Tiddler(name);
					tiddler.bag = store.getBag(bag);
					if ((languages.hasOwnProperty(type)) && (!TiddlyWikiMode)) {
						tiddler.type = languages[type].type;
					} else {
						$.extend(tiddler.tags, languages[type].tags);
					}
					store.addTiddler(tiddler, true);
				}
				// spawn a new tab and ace ide
				newWindow(type, name);
			});
		}
	},

	displayMessage = function(message) {
		var timer,
			createTimer = function() {
				timer = window.setTimeout(function() {
					$('#messageArea').text('');
				}, 5000);
			};
		$('#messageArea').text(message);
		if (timer) {
			window.clearTimeout(timer);
		}
		createTimer(timer);
	},

	// set up a new ace ide inside the given tab
	newACE = function(el, type, name) {
		var editor = ace.edit(el),
			session = editor.getSession(),
			tiddler = store.getTiddler(name),
			tiddlerText = tiddler.text || '',
			readOnly = (tiddler && tiddler.permissions &&
				tiddler.permissions.indexOf('write') === -1) ? true : false,
			mode;
		editor.setTheme('ace/theme/twilight');
		try {
			mode = require('ace/mode/' + type).Mode;
			session.setMode(new mode());
		} catch(e) {
			// just don't set a mode if we can't find one
		}
		session.setValue(tiddlerText);
		session.setUseSoftTabs(false);
		editor.setReadOnly(readOnly);
		// store the modified tiddler in pending
		session.on('change', function(e) {
			var newText = session.getValue(),
				tiddler = store.getTiddler(name),
				newTiddler = $.extend(true, {}, tiddler) ||
					new tiddlyweb.Tiddler(name, store.recipe);
			newTiddler.text = newText;
			store.addTiddler(newTiddler, true);
		});
		openTiddlers[name] = editor;
		editor.gotoLine(0);
		// refresh the tab if the tiddler changes on the server
		// XXX: this will discard changes that have not been saved. It should probably be more intelligent
		store.bind('tiddler', name, function(newTiddler) {
			if (newTiddler.lastSync) { // it's not just a local tiddler
				store.getTiddler(newTiddler.title, function(textTiddler) {
					session.setValue(textTiddler.text);
					displayMessage(newTiddler.title + ' updated from server.');
					store.remove(textTiddler); // remove local changed version
				});
			}
		});
	}, refresh;

refresh = {
	handler: function() {
		window.setTimeout(refresh.handler, refresh.frequency);
		store.refreshTiddlers();
	},
	frequency: 30000
};


$(function() {
	// set up the tabbed interface
	$('#workingArea').tabs({
		tabTemplate: $('#tabTemplate').html(),
		add: function(ev, ui) {
			var $uiTab = $(ui.tab),
				title = $uiTab.text(),
				type = getTiddlerType(store.getTiddler(title));
			switchToTab(title);
			$uiTab.data('tiddler', title);
			newACE(ui.panel, type, title);
		}
	});

	// close the tab when the user clicks the close button
	$('#tabList span.ui-icon-close').live('click', function() {
		var $this = $(this),
			index = $('#tabList li').index($this.parent()),
			title = $this.siblings().data('tiddler');
		$('#workingArea').tabs('remove', index);
		delete openTiddlers[title];
	});

	// set up and create the new tiddler modal dialog
	var okDialogBtn = function() {
			var $this = $(this),
				name = $this.find('[name=tiddlerName]input').val(),
				type = $this.find('[name=tiddlerType]select').val();
			store.getSpace(function(space) {
				if (space) {
					var bagName = space.name + '_public';
					openTiddler(type, name, bagName);
				}
			});
			$this.dialog('close');
		},
		$dialog = $($('#tiddlerDialogTemplate').html()).appendTo(document),
		typeOptions = $('#tiddlerTypeOptions').html(), $selectDialog;
		$dialog.dialog({
			autoOpen: false,
			modal: true,
			buttons: {
				'OK': okDialogBtn,
				'Cancel': function() {
					$(this).dialog('close');
				}
			},
			open: function() {
				$(this).find('[name=tiddlerType]select').val('other');
			},
			close: function() {
				$(this).find('input, select').val('');
			}
		}).find('form').submit(function() {
			okDialogBtn.apply($dialog[0], []);
			return false;
		}).end();
		$selectDialog = $dialog.find('[name=tiddlerType]select');
	$.each(languages, function(type) {
		$selectDialog.append(typeOptions.replace(/#\{type\}/g, type));
	});

	// set up tiddler command buttons
	$('#toolbar').find('.newTiddler').click(function() {
		$dialog.dialog('open');
	}).end().find('.save').click(function() {
		var $this = $(this);
		if ($this.hasClass('saving')) {
			return false;
		}
		$this.addClass('saving');
		displayMessage('Saving Tiddlers');
		store.save(function(response, error){
			if (response) {
				displayMessage('Saved all Tiddlers');
			} else if (error.name === 'SaveError') {
				displayMessage('There was a problem saving. Please try again');
			} else if (error.name === 'EmptyError') {
				displayMessage('There is nothing to save');
			}
			$this.removeClass('saving');
		});
	});

	// populate the tiddler list
	var $tiddlers = $('#tiddlers'),
		$readOnlyTiddlers = $('#readOnlyTiddlers'),
		tiddlerTypeTemplate = $('#tiddlerTypeTemplate').html(),
		tiddlerTemplate = $('#tiddlerListTemplate').html(),
		$types = {};
	// set up sections for each type of tiddler
	$.each(languages, function(type) {
		var $tiddlerType = $(tiddlerTypeTemplate.replace(/#\{type\}/g,
			type)).find('a').click(function() {
				var $this = $(this);
				$this.siblings('ul').slideToggle('fast');
			}).end().find('ul').hide().end();
		$types[type] = $tiddlerType;
		$('#tiddlers, #readOnlyTiddlers').append($tiddlerType);
	});
	$('#readOnly').find('a:first').click(function() {
		$('#readOnlyTiddlers').slideToggle('fast');
	}).end().find('#readOnlyTiddlers').hide().end();
	// a tiddler has loaded into the store. Check we don't have it already, and add it to the correct section if necessary
	store.bind('tiddler', null, function(tiddler) {
		store.getSpace(function(space) {
			var bagSpace = tiddler.bag.name.replace(/_[^_]*$/, ''),
				$tidList, readOnly, type = getTiddlerType(tiddler),
				selector = '.tiddlers' + type + ' ul',
				tiddlers = store().map(function(tid) {
					var matched = false;
					if (languages[type].type !== '') {
						return (tiddler.type === tid.type) ? tid : undefined;
					} else {
						$.each(languages, function(name, obj) {
							if (obj.type === tid.type) {
								matched = true;
								return false;
							}
						});
						return (matched) ? undefined : tid;
					}
				});
			if (space.name === bagSpace) {
				readOnly = false;
			} else {
				readOnly = true;
			}

			$tidList = (readOnly) ? $readOnlyTiddlers : $tiddlers;
			$tidList = $tidList.find(selector).html('');
			if (!readOnly) {
				tiddlers = tiddlers.space(space.name);
			} else {
				tiddlers = tiddlers.map(function(tid) {
					return (space.name !== tid.bag.name.replace(/_[^_]*$/, '')
						) ? tid : undefined;
				});
			}
			tiddlers.sort(function(a, b) {
				return (a.title.toLowerCase() < b.title.toLowerCase()) ? -1 : 1;
			}).reduce($tidList, function(tid, $list) {
				$list.append($(tiddlerTemplate.replace(/#\{title\}/g,
					tid.title)).click(function() {
						openTiddler(type, tid.title, tid.bag.name);
						return false;
					}));
				return $list;
			});
		});
	});

	// populate the store and set the timer up
	var refreshTimer = null, getChildren;
	store.refreshTiddlers(null, function(tiddlers) {
		store.retrieveCached();
		// start the timer to refresh tiddlers every xxx seconds
		if (!refreshTimer) {
			refreshTimer = window.setTimeout(refresh.handler,
				refresh.frequency);
		}
	});
});

return {
	open: openTiddler,
	store: store,
	openTiddlers: openTiddlers,
	refresh: refresh
};

}(jQuery));
