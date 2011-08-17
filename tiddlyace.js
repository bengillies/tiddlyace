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
	store = tiddlyweb.Store(null, false),

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
	openTiddler = function(type, name) {
		if (openTiddlers[name]) {
			switchToTab(name);
		} else {
			// tiddlers are skinny by default, so get the fat version
			store.get(name, function(tiddler) {
				if (!tiddler) {
					tiddler = new tiddlyweb.Tiddler(name);
					if ((languages.hasOwnProperty(type)) && (!TiddlyWikiMode)) {
						tiddler.type = languages[type].type;
					} else {
						$.extend(tiddler.tags, languages[type].tags);
					}
					store.add(tiddler, true);
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
		var editor = ace.edit(el), session, tiddler, tiddlerText, readOnly, mode;
			session = editor.getSession();
			tiddler = store.get(name);
			tiddlerText = tiddler.text || '';
			readOnly = (tiddler && tiddler.permissions &&
				tiddler.permissions.indexOf('write') === -1) ? true : false;
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
				tiddler = store.get(name) || new tiddlyweb.Tiddler(name);
			tiddler.text = newText;
			store.add(tiddler, true);
		});
		openTiddlers[name] = editor;
		editor.gotoLine(0);
	}, refresh;

refresh = {
	handler: function() {
		window.setTimeout(refresh.handler, refresh.frequency);
		store.refresh();
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
				type = getTiddlerType(store.get(title));
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
			openTiddler(type, name);
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
	var tiddlerTypeTemplate = $('#tiddlerTypeTemplate').html(),
		tiddlerTemplate = $('#tiddlerListTemplate').html(),
		$types = {};

	// hide read only sections by default
	$('#readOnly').find('a:first').click(function() {
		$('#readOnlyTiddlers').slideToggle('fast');
	}).end().find('#readOnlyTiddlers').hide().end();

	// add sections and populate with tiddlers
	$.each(['#tiddlers', '#readOnlyTiddlers'], function(readOnly, selector) {
		var $tiddlers = $(selector);

		$.each(languages, function(type, details) {
			// construct each section
			var $tiddlerType = $(tiddlerTypeTemplate.replace(/#\{type\}/g,
					type)).find('a').click(function() {
						var $this = $(this);
						$this.siblings('ul').slideToggle('fast');
					}).end().find('ul').hide().end().appendTo($tiddlers),
				mime = details.type, ts;

			// fill it with tiddlers
			ts = (mime) ? store('type', mime) : store().not('type');
			ts.space(!readOnly).bind(function(tiddler) {
				var $sorted, title = tiddler.title, prevTiddler, results = [];
				$(tiddlerTemplate.replace(/#\{title\}/g, title))
					.appendTo($('ul', $tiddlerType));

				// sort the list
				$sorted = $('li', $tiddlerType);
				$sorted.sort(function(a, b) {
					return ($(a).attr('tiddler').toLowerCase() >
							$(b).attr('tiddler').toLowerCase()) ?
						1 : -1;
				});
				// make unique
				$sorted.each(function(i, el) {
					var tid = $(el).attr('tiddler');
					if (!prevTiddler || prevTiddler !== tid) {
						results.push(el);
					}
					prevTiddler = tid;
				});

				// replace the un-sorted version
				$('ul', $tiddlerType).html('').append(results);

				// set up on click events (we need to do this here as sorting destroys them all
				$.each(results, function(i, el) {
					var $el = $(el), title = $el.attr('tiddler');
					$el.click(function() {
						openTiddler(type, title);
						return false;
					});
				});
			});
		});
	});

	// populate the store and set the timer up
	var refreshTimer = null, getChildren;
	store.refresh(function(tiddlers) {
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
