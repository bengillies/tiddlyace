/*
 * main entry point for TiddlyACE
 *
 * TiddlyACE integrates TiddlySpace with the Ace IDE (https://github.com/ajaxorg/ace)
 *
 * TiddlyACE itself written by Ben Gillies
 *
 * Dependencies: jQuery, Ace, chrjs, jQueryUI, chrjs.store
 */

window.tiddlyace = (function($) {

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
		var mimeType = (tiddler.type) ? tiddler.type :
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
		var id = type + '_' + String(Math.random()).slice(2),
			newType = (languages.hasOwnProperty(type)) ? type : 'javascript';
		$('#workingArea').tabs('add', '#' + id, name);
	},

	switchToTab = function(name) {
		var hashID = $('#tabList a').map(function(i, el) {
			return ($(el).text() === name) ? el : null;
		}).attr('href');
		$('#workingArea').tabs('select', hashID);
	},

	// open a tiddler in a new tab with its own ace editor, creating it first if necessary
	openTiddler = function(type, name, bag) {
		if (openTiddlers[name]) {
			switchToTab(name);
		} else {
			// tiddlers are skinny by default, so get the fat version
			store.getTiddler(name, function(tiddler) {
				if (!tiddler) {
					tiddler = new tiddlyweb.Tiddler(name);
					tiddler.bag = store.bags[bag];
					if ((languages.hasOwnProperty(type)) && (!TiddlyWikiMode)) {
						tiddler.type = languages[type].type;
					} else {
						$.extend(tiddler.tags, languages[type].tags);
					}
					// TODO: replace this with an addTiddler method in the chrjs store
					store.tiddlers[name] = tiddler;
					store.pending[name] = tiddler;
				}
				// spawn a new tab and ace ide
				newWindow(type, name);
			});
		}
	},

	// all tiddlers currently open in a tab
	openTiddlers = {},

	// set up a new ace ide inside the given tab
	newACE = function(el, type, name) {
		var editor = ace.edit(el),
			session = editor.getSession(),
			tiddlerText = (store.tiddlers[name] && store.tiddlers[name].text) ?
				store.tiddlers[name].text : '',
			mode;
		editor.setTheme('ace/theme/twilight');
		try {
			mode = require('ace/mode/' + type).Mode;
			session.setMode(new mode());
		} catch(e) {
			// just don't set a mode if we can't find one
		}
		session.setValue(tiddlerText);
		// store the modified tiddler in pending
		session.on('change', function(e) {
			var newText = session.getValue(),
				tiddler = store.pending[name];
			if (!tiddler) {
				tiddler = $.extend(true, {}, store.tiddlers[name]) ||
					new tiddlyweb.Tiddler(name, store.recipe);
				store.pending[name] = tiddler;
			}
			tiddler.text = newText;
		});
		openTiddlers[name] = editor;
		editor.gotoLine(0);
		// refresh the tab if the tiddler changes on the server
		// XXX: this will discard changes that have not been saved. It should probably be more intelligent
		store.bind('tiddler', name, function(newTiddler) {
			store.getTiddler(newTiddler.title, function(textTiddler) {
				session.setValue(textTiddler.text);
				delete store.pending[textTiddler.title];
			});
		});
	},

	refresh = {
		handler: function() {
			setTimeout(refresh.handler, refresh.frequency);
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
				type = getTiddlerType(store.tiddlers[title]);
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
			openTiddler(type, name, 'public');
			$this.dialog('close');
		},
		$dialog = $($('#tiddlerDialogTemplate').html()).appendTo(document)
			.dialog({
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
			}).end(),
		typeOptions = $('#tiddlerTypeOptions').html(),
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
		$this.toggleClass('saving');
		store.savePending(function(){
			$this.toggleClass('saving');
		});
	});

	// populate the tiddler list
	var $tiddlers = $('#tiddlers'),
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
		$tiddlers.append($tiddlerType);
	});
	// a tiddler has loaded into the store. Check we don't have it already, and add it to the correct section if necessary
	// TODO: add tiddlers in alphabetical order
	store.bind('tiddler', null, function(tiddler) {
		// check we haven't already added this tiddler
		var $tiddler = $tiddlers.find('li').map(function(i, item) {
			return ($(item).attr('tiddler') === tiddler.title) ?
				item : null;
		});
		if ($tiddler.length === 0) {
			var tiddlerType = getTiddlerType(tiddler);
			$tiddler = $(tiddlerTemplate.replace(/#\{title\}/g,
				tiddler.title)).click(function() {
					openTiddler(tiddlerType, tiddler.title, tiddler.bag.name);
					return false;
				});
			$tiddlers.find('.tiddlers' + tiddlerType + ' ul').append($tiddler);
		}
	});

	// populate the store and set the timer up
	var refreshTimer = null,
		// get bags and tiddlers once we have a recipe to get them from
		getChildren = function() {
			store.refreshBags();
			store.refreshTiddlers();
			store.unbind('recipe', null, getChildren);
			// start the timer to refresh tiddlers every xxx seconds
			if (!refreshTimer) {
				refreshTimer = setTimeout(refresh.handler, refresh.frequency);
			}
		};
	store.bind('recipe', null, getChildren);
	store.refreshRecipe();
});

return {
	open: openTiddler,
	store: store,
	openTiddlers: openTiddlers,
	refresh: refresh
};

})(jQuery);
