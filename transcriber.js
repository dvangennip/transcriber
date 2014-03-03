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

var playbackRate = 1,
	playbackSpeedSlider,
	playbackSpeedLabel,
	sourceAudio,
	sourceLabel,
	canPlay = false,
	transcript,
	dropNotification,
	allowedFileTypes = ['audio/mpeg','audio/ogg','audio/wav'],
	helpButton,
	helpButtonText,
	infoArea,
	infoAreaOpen = true,
	startButton;

var init = function () {
	playbackSpeedSlider = $('input_playback_speed');
	playbackSpeedLabel = $('label_playback_speed');
	sourceAudio = $('source_audio');
	sourceLabel = $('source_label');
	transcript = $('transcript');
	dropNotification = $('drop_notification');
	helpButton = $('help_button');
	helpButtonText = $('help_button_link');
	infoArea = $('info_area');
	startButton = $('info_start_button');

	// set styles
	dropNotification.style.display = 'none';

	// set event listeners
	addEvent(playbackSpeedSlider, 'input', onSpeedChange);
	
	addEvent(window, 'dragover', onSourceFileDrag);
    addEvent(window, 'dragenter', onSourceFileDrag);
    addEvent(window, 'dragleave', onSourceFileDrag);
	addEvent(window, 'drop', onSourceFileDrop);

	addEvent(window, 'keydown', onWritingKeyDown);
	addEvent(sourceAudio, 'canplay', onAudioStateChange);
	addEvent(helpButton, 'click', onHelpClick);
	addEvent(startButton, 'click', onStartClick);

	// TODO read default values/last text/last file from localStorage?
};

var onSpeedChange = function (inEvent) {
	playbackRate = parseFloat(playbackSpeedSlider.value,10);
	// set label
	playbackSpeedLabel.innerHTML = 'Speed (' + playbackRate + 'x)';
	// set playback speed
	sourceAudio.playbackRate = playbackRate;
};

var onSourceFileDrag = function (inEvent) {
	// dragover, dragenter need to return false for a valid drop target element
	if (inEvent.type === 'dragleave') {
		dropNotification.style.display = 'none';
	} else {
		dropNotification.style.display = '';
	}
	inEvent.preventDefault();
};

var onSourceFileDrop = function (inEvent) {
	var file = inEvent.dataTransfer.files[0];

	// set audio source if file is suitable
	if (file && allowedFileTypes.indexOf(file.type) !== -1) {
		sourceAudio.src = window.URL.createObjectURL(file);
		sourceLabel.innerHTML = file.name;
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
	dropNotification.style.display = 'none';
	// prevent setting page url to this file location
	inEvent.preventDefault();
};

var onWritingKeyDown = function (inEvent) {
	// check if audio control key combo
	switch (inEvent.keyCode) {
		case 96: // numpad 0
		case 101: // numpad 5
			audioToggle();
			inEvent.preventDefault();
			break;
		case 100: // numpad 4
			audioSeek(-5);
			inEvent.preventDefault();
			break;
		case 102: // numpad 6
			audioSeek(5);
			inEvent.preventDefault();
			break;
		case 103: // numpad 7
			audioSeek(-10);
			inEvent.preventDefault();
			break;
		case 105: // numpad 9
			audioSeek(10);
			inEvent.preventDefault();
			break;
		case 104: // numpad 8
			insertTimestamp();
			inEvent.preventDefault();
			break;
		case 97: // numpad 1
			audioPlaybackRate(-1);
			inEvent.preventDefault();
			break;
		case 98: // numpad 2
			audioPlaybackRate(0);
			inEvent.preventDefault();
			break;
		case 99: // numpad 3
			audioPlaybackRate(1);
			inEvent.preventDefault();
			break;
		default:
			break;
	}
	// if no control key, just pass along (do nothing)
};

var onAudioStateChange = function (inEvent) {
	canPlay = true;
};

var audioToggle = function () {
	if (canPlay) {
		if (sourceAudio.paused) {
			sourceAudio.play();
			sourceAudio.playbackRate = playbackRate;
		} else {
			sourceAudio.pause();
		}
	}
};

var audioSeek = function (inTime) {
	if (canPlay)
		sourceAudio.currentTime += inTime;
};

var audioPlaybackRate = function (inAdjustment) {
	if (inAdjustment === 0) // reset to 1x
		playbackRate = 1;
	else {
		playbackRate += inAdjustment * 0.1; // add +/- 0.1x
	}
	playbackRate = (playbackRate > 2) ? 2 : ((playbackRate < 0.5) ? 0.5 : playbackRate);

	// propagate this
	playbackSpeedSlider.value = playbackRate;
	onSpeedChange();
};

var insertTimestamp = function () {
	// format sourceAudio.currentTime (gives time in seconds, e.g. 89.456)
	var time = parseFloat(sourceAudio.currentTime, 10),
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
	var selectionStart = transcript.selectionStart;
	var selectionEnd = transcript.selectionStart;
	var first = transcript.value.slice(0, selectionStart);
	var second = transcript.value.slice(selectionStart);
	transcript.value = first + stamp + second;
	// get the cursor back in position (after insertion of 10 characters)
	transcript.selectionStart = selectionStart + 10;
	transcript.selectionEnd = selectionEnd + 10;
};

var onHelpClick = function (inEvent) {
	// toggle info area
	if (infoAreaOpen) {
		infoArea.style.display = 'none';
		helpButtonText.innerHTML = 'Help';
	} else {
		infoArea.style.display = '';
		helpButtonText.innerHTML = '<strong>X</strong> close';
	}
	infoAreaOpen = !infoAreaOpen;
	inEvent.preventDefault();
};

var onStartClick = function (inEvent) {
	onHelpClick(inEvent);
	transcript.focus();
};

// --- Initialise --------------------------------------------------------------

/**
 * Wait for whole page to load before setting up.
 * Prevents problems with objects not loaded yet while trying to assign these.
 */
addEvent(window, 'DOMContentLoaded', function () {
	init();
});