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
const FW_INTERVAL = 30000;
// Requires
const MQTT = require("./mqtt").create(SERVER, {username: USERNAME, password: PASSWORD});
const HUB = require("hubinfo");
const BUTTON_MANAGER = require("buttons");
const FLICAPP = require("flicapp");
// Device info
const SERIAL = HUB.serialNumber.toLowerCase();
const HUB_MODEL = "Flic Hub LR";
const FLICHUB = "flichub";
const MANUFACTURER = "Shortcut Labs AB";
const FLIC = "Flic";
const TWIST = "Twist";
const DUO = "Duo";
// MQTT Topics
const HASS = "homeassistant";
const DEVICE_AUTOMATION = `${HASS}/device_automation`;
const SENSOR = `${HASS}/sensor`;
const HASSIO_STATUS = `${HASS}/status`;
const CONF = "config";
const ACTION = "action";
const FIRMWARE = "firmware";
const DELETE_MSG = "";
const VD_UPDATE = "virtualDeviceUpdate";
const VD_STATE = `${VD_UPDATE}/state`;
const BIG = "big";
const SMALL = "small";
const DUO_SIZE = [BIG, SMALL];
// Actions
const CLICK = "click";
const DOUBLE_CLICK = "double_click";
const HOLD = "hold";
const UP = "up";
const DOWN = "down";
const G_UP = "gesture_up";
const G_DOWN = "gesture_down";
const G_LEFT = "gesture_left";
const G_RIGHT = "gesture_right";
const ACTIONS = [
	  CLICK
	, DOUBLE_CLICK
	, HOLD
	, UP
	, DOWN
	, VD_UPDATE
	, G_UP
	, G_DOWN
	, G_LEFT
	, G_RIGHT
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
	config.expire_after = FW_INTERVAL / 1000 * 6;
	
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
	let serial = button.serialNumber;
	if (serial.startsWith("BF39")) {
		device.model = FLIC + " " + button.flicVersion;
	} else if (serial.startsWith("CA22")) {
		device_type = TWIST;
		device.model = TWIST;
	} else if (serial.startsWith("DA45")) {
		device_type = DUO;
		device.model = DUO;
	}
	
	if (button.name == null || button.name == "") {
		device.name = `${object_id} - ${device_type}`;
	} else {
		device.name = `${button.name} - ${device_type}`;
	}
	device.sw_version = button.firmwareVersion;
	device.via_device = SERIAL;

	for (let i = 0; i < ACTIONS.length; i++) {
		let action = ACTIONS[i];
		let is_gesture = action.includes("gesture");
		let config_topic = `${DEVICE_AUTOMATION}/${object_id}/${action}/${CONF}`;
		
		let config = {};
		config.automation_type = "trigger";
		config.type = "action";
		config.device = device;
		config.subtype = action;
		config.payload = action;
		config.topic = `${DEVICE_AUTOMATION}/${object_id}/${ACTION}`;
		
		if (action == VD_UPDATE) {
			delete config.payload;
			config.topic = `${DEVICE_AUTOMATION}/${object_id}/${action}`;
			MQTT.publish(config_topic, JSON.stringify(config), {retain: true});	
		}

		if (
			!is_gesture &&
			action != VD_UPDATE &&
			(
				device_type == FLIC || 
				(device_type == TWIST && action != HOLD)
			)
		) {
			MQTT.publish(config_topic, JSON.stringify(config), {retain: true});			
		}
		
		if (device_type == DUO && action != VD_UPDATE) {
			publishDuoVariation(object_id, config, BIG, action);
			publishDuoVariation(object_id, config, SMALL, action);
			if (!is_gesture) {
				publishDuoVariation(object_id, config, BIG, `wall - ${action}`);
				publishDuoVariation(object_id, config, SMALL, `wall - ${action}`);
			}
		}
		
	}
}

function publishDuoVariation(object_id, config, size, action) {
	config.topic = `${DEVICE_AUTOMATION}/${object_id}/${size}/${ACTION}`;			
	
	let duo_action = `${size} - ${action}`
	config.subtype = duo_action;
	config.payload = action;
	config_topic = `${DEVICE_AUTOMATION}/${object_id}/${duo_action.replaceAll(" ", "")}/${CONF}`;
	MQTT.publish(config_topic, JSON.stringify(config), {retain: true});
}

function publishAllButtonTriggers() {
	let buttons = BUTTON_MANAGER.getButtons();
	for (let i = 0; i < buttons.length; i++) {
		publishButtonTriggers(buttons[i]);
	}	
}

function deleteButtonTriggers(bdaddr) {
	let object_id = getObjectID(bdaddr);
	for (let i = 0; i < ACTIONS.length; i++) {
		let action = ACTIONS[i][0];
		let topic = `${DEVICE_AUTOMATION}/${object_id}/${action}/${CONF}`;
		MQTT.publish(topic, DELETE_MSG, {retain: true});
	}
}

function publishHubFirmware() {
	MQTT.publish(`${FLICHUB}/${SERIAL}/${FIRMWARE}`, HUB.firmwareVersion, {retain: false});
}

function updateAll() {
	publishAllButtonTriggers();
	publishHubConfig();
	publishHubFirmware();
}

function handleAction(obj, action) {
	let object_id = getObjectID(obj.bdaddr);
	//console.log(JSON.stringify(obj));
	
	let topic = `${DEVICE_AUTOMATION}/${object_id}/${ACTION}`;
	
	if (Object.hasOwn(obj, "gesture") && Object.hasOwn(obj, "buttonNumber")) {
		let size = DUO_SIZE[obj.buttonNumber];
		topic = `${DEVICE_AUTOMATION}/${object_id}/${size}/${ACTION}`;
		
		if (obj.gesture != "unrecognized" && obj.gesture != null) {
			action = `gesture_${obj.gesture}`;
		}
	}
	
	MQTT.publish(topic, action);
}

BUTTON_MANAGER.on("buttonSingleOrDoubleClickOrHold", function(obj) {
	let action = obj.isSingleClick ? CLICK : obj.isDoubleClick ? DOUBLE_CLICK : HOLD;
	handleAction(obj, action);
});

BUTTON_MANAGER.on("buttonDown", function(obj) {
	handleAction(obj, DOWN);
});

BUTTON_MANAGER.on("buttonUp", function(obj) {
	handleAction(obj, UP);
});

FLICAPP.on("actionMessage", function(message) {
	//console.log(message);
	let re = /^([/].+?):([^:]+?)$/;
	let found = message.match(re);
	if (found != null) {
		let topic = found[1];
		message = found[2];
		MQTT.publish(`${FLIC}${topic}`, message);	
	} else {
		MQTT.publish(`${FLIC}/action_message`, message);	
	}	
});

FLICAPP.on(VD_UPDATE, function(metaData, values) {
	let data = {};
	data.meta_data = metaData;
	data.values = values;
	let object_id = getObjectID(metaData.buttonId);
	// console.log(JSON.stringify(data));
	MQTT.publish(`${DEVICE_AUTOMATION}/${object_id}/${VD_UPDATE}`, JSON.stringify(data));
});

BUTTON_MANAGER.on("buttonReady", function(obj) {
	// console.log("ready");
	let button = BUTTON_MANAGER.getButton(obj.bdaddr);
	publishButtonTriggers(button);
});

BUTTON_MANAGER.on("buttonUpdated", function(obj) {
	// console.log("updated");
	let button = BUTTON_MANAGER.getButton(obj.bdaddr);
	if (button.name != null && button.name != "") {
		publishButtonTriggers(button);
	}
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
	MQTT.subscribe(`${FLIC}/${VD_STATE}`);
	updateAll();
});

MQTT.on("publish", function(pub) {
	// HA publishes a message when it (re)connects to the MQTT broker
	if (pub.topic == HASSIO_STATUS && pub.message == "online") {
		updateAll();
	}
	if (pub.topic == `${FLIC}/${VD_STATE}`) {
		let update = {};
		try {
			update = JSON.parse(pub.message);
		} catch (error) {
			console.log(`Error parsing ${pub.message}`)
			console.log(error);
		}
		if ("type" in update && "id" in update && "values" in update) {
			// console.log(update.type, update.id, JSON.stringify(update.values));
			FLICAPP.virtualDeviceUpdateState(update.type, update.id, update.values);
		}
	}
});

MQTT.connect();

setInterval(publishHubFirmware, FW_INTERVAL);
