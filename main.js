/*** config.js ***
exports.config = {
	"server": "xxx.xxx.xxx.xxx",
	"username": "xxxxx",
	"password": "xxxxxxxx",
}
*** config.js ***/
// Configs
const CONFIG = require("./config").config; // The SDK doesn't seem to support require for json files
const SERVER = CONFIG.server;
const USERNAME = CONFIG.username;
const PASSWORD = CONFIG.password;
// Requires
const MQTT = require("./mqtt").create(SERVER, {username: USERNAME, password: PASSWORD});
const HUB = require("hubinfo");
const BUTTON_MANAGER = require("buttons");
// Device info
const SERIAL = HUB.serialNumber.toLowerCase();
const HUB_MODEL = "Flic Hub LR";
const FLICHUB = "flichub";
const MANUFACTURER = "Shortcut Labs AB";
const FLIC = "Flic";
const TWIST = "Twist"
// MQTT Topics
const HASS = "homeassistant";
const DEVICE_AUTOMATION = `${HASS}/device_automation`;
const SENSOR = `${HASS}/sensor`;
const HASSIO_STATUS = `${HASS}/status`;
const CONF = "config";
const CLICK_TYPE = "clickType";
const FIRMWARE = "firmware";
// Actions
const CLICK = "click";
const DOUBLE_CLICK = "double_click";
const HOLD = "hold";
const UP = "up";
const DOWN = "down";
// [<type>,<icon>]
// icons for possibly setting up HA entities, not currently used
const CLICKTYPES = [
	[CLICK,"mdi:gesture-tap"],
	[DOUBLE_CLICK, "mdi:gesture-double-tap"],
	[HOLD, "mdi:gesture-tap-hold"],
	[UP, "mdi:arrow-collapse-up"],
	[DOWN, "mdi:arrow-collapse-down"]
];


function publishHubConfig() {
	let device = {};
	device.sw_version = HUB.firmwareVersion;
	device.identifiers = [SERIAL];
	device.manufacturer = MANUFACTURER;
	device.model = HUB_MODEL;
	device.name = HUB_MODEL;
	
	let config = {};
	config.unique_id = `${FLICHUB}_${SERIAL}_${FIRMWARE}`;
	config.object_id = config.unique_id;
	config.name = "Firmware Version";
	config.device = device;
	config.state_topic = `${FLICHUB}/${SERIAL}/${FIRMWARE}`;
	
	let topic = `${SENSOR}/${FLICHUB}_${SERIAL}/${CONF}`;
	MQTT.publish(topic, JSON.stringify(config), {retain: true});	
}

function getObjectID(bdaddr) {
	// When a button is deleted, only the bdaddr is provided
	// So that's what has to be used for the object_id 
	return "flic_" + bdaddr.replace(/[:]/g,"");
}
 
function publishButtonTriggers(button) {
	let object_id = getObjectID(button.bdaddr);

	let device = {};
	device.connections = [["mac", button.bdaddr]];
	device.hw_version = button.flicVersion;
	device.identifiers = [
		button.bdaddr,
		button.serialNumber,
		button.uuid
	];
	device.manufacturer = MANUFACTURER;

	let device_type = FLIC;
	if (button.flicVersion == 3) {
		device_type = TWIST;
		device.model = TWIST;
	} else {
		device.model = FLIC + " " + button.flicVersion;
	}
	
	if (button.name == null || button.name == "") {
		device.name = object_id;
	} else {
		device.name = button.name + " - " + device_type;
	}
	device.sw_version = button.firmwareVersion;
	device.via_device = SERIAL;

	for (let i = 0; i < CLICKTYPES.length; i++) {
		let clickType = CLICKTYPES[i][0];
		let config = {};
		config.automation_type = "trigger";
		config.type = "action";
		config.subtype = clickType;
		config.payload = clickType;
		config.topic = `${DEVICE_AUTOMATION}/${object_id}/${CLICK_TYPE}`;
		config.device = device;
		
		if (device_type == FLIC || (device_type == TWIST && clickType != HOLD)) {
			let topic = `${DEVICE_AUTOMATION}/${object_id}/${clickType}/${CONF}`;
			MQTT.publish(topic, JSON.stringify(config), {retain: true});			
		}
	}
}

function publishAllButtonTriggers() {
	let buttons = BUTTON_MANAGER.getButtons();
	for (let i = 0; i < buttons.length; i++) {
		publishButtonTriggers(buttons[i]);
	}	
}

function updateAll() {
	publishAllButtonTriggers();
	publishHubConfig();
	MQTT.publish(`${FLICHUB}/${SERIAL}/${FIRMWARE}`, HUB.firmwareVersion, {retain: false});
}

function deleteButtonTriggers(bdaddr) {
	let object_id = getObjectID(bdaddr);
	for (let i = 0; i < CLICKTYPES.length; i++) {
		let clickType = CLICKTYPES[i][0];
		// empty config deletes the device/trigger in HA
		let topic = `${DEVICE_AUTOMATION}/${object_id}/${clickType}/${CONF}`;
		MQTT.publish(topic, "", {retain: true});
	}
}

BUTTON_MANAGER.on("buttonSingleOrDoubleClickOrHold", function(obj) {
	let object_id = getObjectID(obj.bdaddr);
	let clickType = obj.isSingleClick ? CLICK : obj.isDoubleClick ? DOUBLE_CLICK : HOLD;
	MQTT.publish(`${DEVICE_AUTOMATION}/${object_id}/${CLICK_TYPE}`, clickType);
});

BUTTON_MANAGER.on("buttonDown", function(obj) {
	let object_id = getObjectID(obj.bdaddr);
	MQTT.publish(`${DEVICE_AUTOMATION}/${object_id}/${CLICK_TYPE}`, DOWN);
});

BUTTON_MANAGER.on("buttonUp", function(obj) {
	let object_id = getObjectID(obj.bdaddr);
	MQTT.publish(`${DEVICE_AUTOMATION}/${object_id}/${CLICK_TYPE}`, UP);
});

BUTTON_MANAGER.on("buttonReady", function(obj) {
	console.log("ready");
	let button = BUTTON_MANAGER.getButton(obj.bdaddr);
	publishButtonTriggers(button);
});

BUTTON_MANAGER.on("buttonDeleted", function(obj) {
	console.log("delete");
	deleteButtonTriggers(obj.bdaddr); 
});

MQTT.on("disconnected", function() {
	console.log("disconnected");
	MQTT.connect();
});

MQTT.on("error", function(message) {
	console.log("error: " + message);
	setTimeout(function (){
		console.log("Attempt to reconnect");
		MQTT.connect();
	}, 1000);
});

MQTT.on("connected", function() {
	MQTT.subscribe(HASSIO_STATUS);
	updateAll();
});

MQTT.on("publish", function(pub) {
	// HA publishes a message when it (re)connects to the MQTT broker
	// Republish triggers when that happens even though they'll be 
	// republished every 10 seconds (below)
	// Might not be needed since the configs are published with retain
	if (pub.topic == HASSIO_STATUS && pub.message == "online") {
		let buttons = BUTTON_MANAGER.getButtons();
		for (let i = 0; i < buttons.length; i++) {
			publishButtonTriggers(buttons[i]);
		}	
	}
});

MQTT.connect();

// Contiuously update because the buttonReady and buttonUpdated
// events don't wait for the button name to be entered, and don't
// trigger when it is entered or changed.
setInterval(updateAll, 10000);
