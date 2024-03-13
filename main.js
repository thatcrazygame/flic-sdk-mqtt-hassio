/*** config.js ***
exports.config = {
	"server": "xxx.xxx.xxx.xxx",
	"username": "xxxxx",
	"password": "xxxxxxxx",
}
*** config.js ***/
// The SDK doesn't seem to support require for json files
var config = require("./config").config;
var SERVER = config.server;
var USERNAME = config.username;
var PASSWORD = config.password;
// Placholder for the via_device config in case there's a way and/or 
// reason to turn the hub itself into an MQTT device in HA
var HUB = require("hubinfo").serialNumber.toLowerCase();


var mqtt = require("./mqtt").create(SERVER, {username: USERNAME, password: PASSWORD});

var HASSIO_DISCOVERY = 'homeassistant/device_automation/';
var HASSIO_STATUS = "homeassistant/status"
// [<type>,<icon>]
// icons for possibly setting up HA entities, not currently used
var CLICKTYPES = [
	["click","mdi:gesture-tap"],
	["double_click", "mdi:gesture-double-tap"],
	["hold", "mdi:gesture-tap-hold"]
];

var buttonManager = require("buttons");

function getObjectID(bdaddr) {
	// When a button is deleted, only the bdaddr is provided
	// So that's what has to be used for the object_id 
	return "flic_" + bdaddr.replace(/[:]/g,"");
}
 
function publishButtonTriggers(button) {
	var object_id = getObjectID(button.bdaddr);

	var device = {};
	device.connections = [["mac", button.bdaddr]];
	device.hw_version = button.flicVersion;
	device.identifiers = [
		button.bdaddr,
		button.serialNumber,
		button.uuid
	];
	device.manufacturer = "Shortcut Labs AB";

	var flic_or_twist = "Flic";
	if (button.flicVersion == 3) {
		flic_or_twist = "Twist";
		device.model = "Twist";
	} else {
		device.model = "Flic " + button.flicVersion;
	}
	
	if (button.name == null || button.name == "") {
		device.name = object_id;
	} else {
		device.name = button.name + " - " + flic_or_twist;
	}
	device.sw_version = button.firmwareVersion;
	device.via_device = HUB;

	for (var i = 0; i < CLICKTYPES.length; i++) {
		var clickType = CLICKTYPES[i][0];
		var config = {};
		config.automation_type = "trigger";
		config.type = "action";
		config.subtype = clickType;
		config.payload = clickType;
		config.topic = HASSIO_DISCOVERY + object_id + "/clickType";
		config.device = device;
		
		//var icon = CLICKTYPES[i][1];		
		//config.icon = icon;

		if (clickType == "click" || clickType == "double_click" || (clickType == "hold" && flic_or_twist != "Twist")) {
			mqtt.publish(HASSIO_DISCOVERY + object_id + "/" + clickType + "/config"
									 , JSON.stringify(config)
									 , {retain: true});			
		}
	}
}

function publishAllButtonTriggers() {
	var buttons = buttonManager.getButtons();
	for (var i = 0; i < buttons.length; i++) {
		publishButtonTriggers(buttons[i]);
	}	
}

function deleteButtonTriggers(bdaddr) {
	var object_id = getObjectID(bdaddr);
	for (var i = 0; i < CLICKTYPES.length; i++) {
		var clickType = CLICKTYPES[i][0];
		// empty config deletes the device/trigger in HA
		mqtt.publish(HASSIO_DISCOVERY + object_id + "/" + clickType + "/config", "", {retain: true});
	}
}

buttonManager.on("buttonSingleOrDoubleClickOrHold", function(obj) {
	var object_id = getObjectID(obj.bdaddr);
	var clickType = obj.isSingleClick ? "click" : obj.isDoubleClick ? "double_click" : "hold";
	mqtt.publish(HASSIO_DISCOVERY + object_id + "/clickType", clickType);
});

buttonManager.on("buttonReady", function(obj) {
	console.log("ready");
	var button = buttonManager.getButton(obj.bdaddr);
	publishButtonTriggers(button);
});

buttonManager.on("buttonDeleted", function(obj) {
	console.log("delete");
	deleteButtonTriggers(obj.bdaddr); 
});


mqtt.on("disconnected", function() {
	mqtt.connect();
});

mqtt.on("error", function() {
	setTimeout(function (){
		mqtt.connect();
	}, 1000);
});

mqtt.on("connected", function() {
	mqtt.subscribe(HASSIO_STATUS);
	publishAllButtonTriggers();
});

mqtt.on("publish", function(pub) {
	// HA publishes a message when it (re)connects to the MQTT broker
	// Republish triggers when that happens even though they'll be 
	// republished every 10 seconds (below)
	// Might not be needed since the configs are published with retain
	if (pub.topic == HASSIO_STATUS && pub.message == "online") {
		var buttons = buttonManager.getButtons();
		for (var i = 0; i < buttons.length; i++) {
			publishButtonTriggers(buttons[i]);
		}	
	}
});

mqtt.connect();



// Contiuously update because the buttonReady and buttonUpdated
// events don't wait for the button name to be entered, and don't
// trigger when it is entered or changed.
setInterval(publishAllButtonTriggers, 10000);
