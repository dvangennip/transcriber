/**
 * Transcriber
 */

// --- Helper functions ------------------------------------------------------

/**
 * Shorthand for getting a reference to an element by ID
 * Helps if unsure whether variable is ID or reference to Element itself
 */
var $ = function (inId) {
	if (inId instanceof Element) {
		return inId;
	} else if (typeof inId === 'string') {
		return document.getElementById(inId);
	}
	return null; // must have a default return value
};

/**
 * Wrapper function to simplify adding events
 * see: http://remysharp.com/2009/01/07/html5-enabling-script/
 *
 * use: addEvent( el, eventname, fn to call ) // el can be an array of elements
 */
var addEvent = function (el, type, fn) {
	if (el && el.nodeName || el === window) {
		el.addEventListener(type, fn, false);
	} else if (el && el.length) {
		for (var i = 0; i < el.length; i++) {
			addEvent(el[i], type, fn);
		}
	}
};

// --- Main functions ----------------------------------------------------------

var TS = {};

TS.init = function () {
	TS.playbackRate = 1;
	TS.playbackSpeedSlider = $('input_playback_speed');
	TS.playbackSpeedLabel = $('label_playback_speed');
	TS.sourceAudio = $('source_audio');
	TS.sourceLabel = $('source_label');
	TS.canPlay = false;
	TS.allowedFileTypes = ['audio/mpeg','audio/ogg','audio/webm','audio/wave','audio/wav','audio/x-wav'],
	TS.storageTimerShort = null;
	TS.storageTimerLong = null;
	TS.textChangedSinceSave = false;
	TS.transcriptTextarea = $('transcript');
	TS.transcriptTextarea.hasFocus = false;
	TS.dropNotification = $('drop_notification');
	TS.helpButton = $('help_button');
	TS.helpButtonText = $('help_button_link');
	TS.infoArea = $('info_area');
	TS.infoAreaOpen = true;
	TS.startButton = $('info_start_button');
	TS.storageFeedback = $('storage_feedback');

	// set styles
	TS.dropNotification.style.display = 'none';

	// set event listeners
	addEvent(TS.playbackSpeedSlider, 'input', TS.onSpeedChange);
	
	addEvent(window, 'dragover',  TS.onSourceFileDrag);
    addEvent(window, 'dragenter', TS.onSourceFileDrag);
    addEvent(window, 'dragleave', TS.onSourceFileDrag);
	addEvent(window, 'drop',      TS.onSourceFileDrop);

	addEvent(window, 'keydown', TS.onWritingKeyDown);
	addEvent(TS.transcriptTextarea, 'change', TS.onTextareaChange);
	addEvent(TS.transcriptTextarea, 'copy',   TS.onTextareaChange);
	addEvent(TS.transcriptTextarea, 'cut',    TS.onTextareaChange);
	addEvent(TS.transcriptTextarea, 'paste',  TS.onTextareaChange);
	addEvent(TS.transcriptTextarea, 'focus',  TS.onTextareaFocus);
	addEvent(TS.transcriptTextarea, 'blur',   TS.onTextareaBlur);

	addEvent(TS.sourceAudio, 'canplay', TS.onAudioStateChange);
	addEvent(TS.helpButton, 'click', TS.onHelpClick);
	addEvent(TS.startButton, 'click', TS.onStartClick);

	addEvent(window, 'pagehide', TS.onPageHide);

	// read last text from storage
	TS.retrieveText();
};

TS.onSpeedChange = function (inEvent) {
	TS.playbackRate = parseFloat(TS.playbackSpeedSlider.value,10);
	// set label
	TS.playbackSpeedLabel.innerHTML = 'Speed (' + TS.playbackRate + 'x)';
	// set playback speed
	TS.sourceAudio.playbackRate = TS.playbackRate;
};

TS.onSourceFileDrag = function (inEvent) {
	// dragover, dragenter need to return false for a valid drop target element
	if (inEvent.type === 'dragleave') {
		TS.dropNotification.style.display = 'none';
	} else {
		TS.dropNotification.style.display = '';
	}
	inEvent.preventDefault();
};

TS.onSourceFileDrop = function (inEvent) {
	var file = inEvent.dataTransfer.files[0];

	// set audio source if file is suitable
	if (file && TS.allowedFileTypes.indexOf(file.type) !== -1) {
		TS.sourceAudio.src = window.URL.createObjectURL(file);
		TS.sourceLabel.innerHTML = file.name;
	} else {
		var message = 'The file you dropped cannot be played. Try one of the following formats:\n\n';
			message += allowedFileTypes.join('\n');

		// alert is a blocking function which can lockup FF due to file system interaction
		// giving the message via a timeout makes it async/indepent from the FileAPI/this callback.
		setTimeout(function () {
			window.alert(message);
		}, 10);
	}

	// reset looks
	TS.dropNotification.style.display = 'none';
	// prevent setting page url to this file location
	inEvent.preventDefault();
};

TS.onWritingKeyDown = function (inEvent) {
	// variable is true is the key leads to text input
	var insertTextKey = false;

	// check if audio control key combo
	switch (inEvent.keyCode) {
		case 96: // numpad 0
		case 101: // numpad 5
			TS.audioToggle();
			inEvent.preventDefault();
			break;
		case 100: // numpad 4
			TS.audioSeek(-5);
			inEvent.preventDefault();
			break;
		case 102: // numpad 6
			TS.audioSeek(5);
			inEvent.preventDefault();
			break;
		case 103: // numpad 7
			TS.audioSeek(-10);
			inEvent.preventDefault();
			break;
		case 105: // numpad 9
			TS.audioSeek(10);
			inEvent.preventDefault();
			break;
		case 104: // numpad 8
			TS.insertTimestamp();
			insertTextKey = true;
			inEvent.preventDefault();
			break;
		case 97: // numpad 1
			TS.audioPlaybackRate(-1);
			inEvent.preventDefault();
			break;
		case 98: // numpad 2
			TS.audioPlaybackRate(0);
			inEvent.preventDefault();
			break;
		case 99: // numpad 3
			TS.audioPlaybackRate(1);
			inEvent.preventDefault();
			break;
		default: // if no control key, just pass along (do nothing)
			if (TS.transcriptTextarea.hasFocus)
				insertTextKey = true;
			break;
	}

	if (insertTextKey)
		TS.onTextareaChange();
};

/**
 * onTextareaChange event handler
 * 
 * Triggers a save if no other action is taken for 5 seconds.
 * To avoid continuously pushing back the save action, there is a long (3 min)
 * timer which will trigger a save at least every few minutes.
 */
TS.onTextareaChange = function (inEvent) {
	// set dirty flag
	TS.textChangedSinceSave = true;
	TS.storageFeedback.classList.add('timer-active');

	// reset short period timer
	clearTimeout(TS.storageTimerShort);
	TS.storageTimerShort = setTimeout(TS.saveText, 5000);

	// make sure long period timer is active
	// do not reset to avoid pushing it back all the time
	if (!TS.storageTimerLong)
		TS.storageTimerLong = setTimeout(TS.saveText, 180000); // 5 minutes
};

TS.onTextareaFocus = function (inEvent) {
	TS.transcriptTextarea.hasFocus = true;
};

TS.onTextareaBlur = function (inEvent) {
	TS.transcriptTextarea.hasFocus = false;
};

TS.onAudioStateChange = function (inEvent) {
	TS.canPlay = true;
};

TS.audioToggle = function () {
	if (TS.canPlay) {
		if (TS.sourceAudio.paused) {
			TS.sourceAudio.play();
			TS.sourceAudio.playbackRate = TS.playbackRate;
		} else {
			TS.sourceAudio.pause();
		}
	}
};

TS.audioSeek = function (inTime) {
	if (TS.canPlay)
		TS.sourceAudio.currentTime += inTime;
};

TS.audioPlaybackRate = function (inAdjustment) {
	if (inAdjustment === 0) // reset to 1x
		TS.playbackRate = 1;
	else {
		TS.playbackRate += inAdjustment * 0.1; // add +/- 0.1x
	}
	TS.playbackRate = (TS.playbackRate > 2) ? 2 : ((TS.playbackRate < 0.5) ? 0.5 : TS.playbackRate);

	// propagate this
	TS.playbackSpeedSlider.value = TS.playbackRate;
	TS.onSpeedChange();
};

TS.insertTimestamp = function () {
	// format sourceAudio.currentTime (gives time in seconds, e.g. 89.456)
	var time = parseFloat(TS.sourceAudio.currentTime, 10),
		hours,
		minutes,
		seconds,
		stamp = '';
	
	hours = Math.floor(time / 3600);
	time = time - 3600 * hours;
	minutes = Math.floor(time / 60);
	seconds = Math.floor(time % 60);

	if (hours < 10) 
		hours = '0' + hours;
	if (minutes < 10)
		minutes = '0' + minutes;
	if (seconds < 10)
		seconds = '0' + seconds;
	stamp = '[' + hours + ':' + minutes + ':' + seconds + ']';
	
	// insert at cursor position in textarea
	var selectionStart = TS.transcriptTextarea.selectionStart;
	var selectionEnd = TS.transcriptTextarea.selectionStart;
	var first = TS.transcriptTextarea.value.slice(0, selectionStart);
	var second = TS.transcriptTextarea.value.slice(selectionStart);
	TS.transcriptTextarea.value = first + stamp + second;
	// get the cursor back in position (after insertion of 10 characters)
	TS.transcriptTextarea.selectionStart = selectionStart + 10;
	TS.transcriptTextarea.selectionEnd = selectionEnd + 10;

	// trigger
	TS.onTextareaChange();
};

TS.onHelpClick = function (inEvent) {
	// toggle info area
	if (TS.infoAreaOpen) {
		TS.infoArea.style.display = 'none';
		TS.helpButtonText.innerHTML = 'Help';
	} else {
		TS.infoArea.style.display = '';
		TS.helpButtonText.innerHTML = '<strong>X</strong> close';
	}
	TS.infoAreaOpen = !TS.infoAreaOpen;
	inEvent.preventDefault();
};

TS.onStartClick = function (inEvent) {
	TS.onHelpClick(inEvent);
	TS.transcriptTextarea.focus();
};

TS.saveText = function () {
	if (TS.textChangedSinceSave) {
		if (localStorage) {
			localStorage.setItem('transcript', TS.transcriptTextarea.value);
			var t = new Date(),
				h = t.getHours(),
				m = t.getMinutes();
			 
			if (h < 10)
				h = '0' + h;
			if (m < 10)
				m = '0' + m;
			TS.storageFeedback.innerHTML = "autosave: last saved at " + h + ":" + m + ".";

			// reset dirty flag
			TS.textChangedSinceSave = false;
			TS.storageFeedback.classList.remove('timer-active');
		}
		else {
			TS.storageFeedback.innerHTML = "<strong>warning:</strong> your text was not saved";
		}
	}

	// restart long period autosave timer
	// just reset short one, will start again on text input
	clearTimeout(TS.storageTimerShort);
	clearTimeout(TS.storageTimerLong);
	TS.storageTimerLong = setTimeout(TS.saveText, 180000); // 3 minutes
};

TS.retrieveText = function () {
	if (localStorage) {
		var text = localStorage.getItem('transcript');
		if (text && text.length > 0) {
			TS.transcriptTextarea.value = text;
			TS.storageFeedback.innerHTML = "text from previous session has been retrieved";
		} else {
			TS.storageFeedback.innerHTML = "ready with new session";
		}
	} else {
		TS.storageFeedback.innerHTML = "<strong>warning:</strong> no text could be retrieved";
	}
};

TS.clearStorage = function () {
	if (localStorage) {
		localStorage.clear();
		TS.transcriptTextarea.value = "";
		TS.storageFeedback.innerHTML = "all data has been cleared";
	} else {
		TS.storageFeedback.innerHTML = "<strong>warning:</strong> data has not been cleared";
	}
};

/**
 * Triggers a save action before the page is unloaded
 * TODO needs work as action comes when elements/object are no longer available...
 */
TS.onPageHide = function (inEvent) {
	//TS.saveText();
};

// --- Initialise --------------------------------------------------------------

/**
 * Wait for whole page to load before setting up.
 * Prevents problems with objects not loaded yet while trying to assign these.
 */
addEvent(window, 'pageshow', function () {
	TS.init();
});