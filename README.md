# flic-sdk-mqtt-hassio
Makes Flic buttons discoverable through Home Assistant MQTT. Useful as an alternative to the [Flic integration](https://www.home-assistant.io/integrations/flic/) if you can't install the flicd service or don't have bluetooth on the device running HA. Or if you already have a Flic hub and just don't want to deal with those other options.

## Setup
1. [Enable Flic Hub SDK](https://hubsdk.flic.io/static/tutorial/)
2. Create a new module (creates main.js and module.json)
3. Create two new files (right click on module > New File)
   - mqtt.js
   - config.js
4. Get the official Flic Hub SDK MQTT implementation
   - [flic-hub-sdk-mqtt-js documentation](https://github.com/50ButtonsEach/flic-hub-sdk-mqtt-js)
   - Copy/Paste the official [mqtt.js](https://raw.githubusercontent.com/50ButtonsEach/flic-hub-sdk-mqtt-js/main/mqtt.js) into your mqtt.js and save it
5. Copy/Paste the following into config.js and adjust to your settings
   ``` javascript
    exports.config = {
      "server": "xxx.xxx.xxx.xxx",
      "username": "xxxxx",
      "password": "xxxxxxxx",
      "hub": "xxxxxxxx",
    }
   ```
   - The server, username, and password are for your MQTT broker
   - hub is mostly unused. I just copied the hub's serial from the top left of the Hub SDK editor
6. Copy/Paste the code from main.js in this repository to your module's main.js
7. With your module selected, check "Restart After Crash." Then click the green play button to run the module
