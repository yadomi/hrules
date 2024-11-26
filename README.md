# `hrules`

hrules processes MQTT messages based on a text configuration file. The configuration file defines rules for subscribing to MQTT topics, evaluating a user defined expression, and publishing responses to specified topics.

## `hrules.rules` File Structure

The configuration file consists of multiple lines, each defining a specific rule. Each rule is separated into three parts using the "->" delimiter. The parts are as follows:

1. **MQTT Topic to Subscribe**: The MQTT topic that the system should subscribe to.
2. **Evaluation Expression**: An expression that is evaluated to determine if the response topic should be published.
3. **Response Topic**: The MQTT topic to which the system should publish the response.

## Syntax

```
<mqtt_topic> -> <expression> -> <response_topic>
<mqtt_topic> | <hours> -> <expression> -> <response_topic> <response_payload>
```

### Example

```
zigbee/wc/sensor01 -> payload.occupancy == true -> hue/set { match: { room: "WC", device: "*" }, state: { on: { on: true } } }
```

### Detailed Breakdown

1. **MQTT Topic to Subscribe**: `zigbee/wc/sensor01`
   - This is the MQTT topic that the system will subscribe to.

2. **Evaluation Expression**: `payload.occupancy == true`
   - This expression evaluates the payload of the MQTT message. In this case, it checks if the `occupancy` field in the payload is `true`.

3. **Response Topic**: `hue/set { match: { room: "WC", device: "*" }, state: { on: { on: true } } }`
   - This is the MQTT topic to which the system will publish the response. The response includes a JSON object used as a payload

## Examples

### Occupancy Sensors

```
zigbee/bathroom/sensor01 -> payload.occupancy == true -> hue/set { match: { room: "Salle de bain", device: "*" }, state: { on: { on: true } } }
zigbee/bathroom/sensor01 -> payload.occupancy == false -> hue/set { match: { room: "Salle de bain", device: "*" }, state: { on: { on: false } } }
```

### Switches

```
zigbee/kitchen/switch -> payload.action == "on_press_release" -> hue/set { match: { room: "Cusine", device: "*" }, state: { on: { on: true } } }
zigbee/kitchen/switch -> payload.action == "off_press_release" -> hue/set { match: { room: "Cusine", device: "*" }, state: { on: { on: false } } }

zigbee/living/switch -> payload.action == "down_hold_release" -> zigbee/living/powersocket02/set "OFF"
zigbee/living/switch -> payload.action == "up_hold_release" -> zigbee/living/powersocket02/set "ON"
```

### Time-Based Rules

The configuration file also supports time-based rules using the | delimiter followed by a time range. This allows rules to be active only during specific times of the day.

```
zigbee/room/switch | 09:00-22:30 -> payload.action == "on_press_release" -> hue/set { match: { room: "Chambre", device: "*" }, state: { on: { on: true }, brightness: 100 } }
zigbee/room/switch | 22:30-09:00 -> payload.action == "on_press_release" -> hue/set { match: { room: "Chambre", device: "*" }, state: { on: { on: true }, brightness: 20 } }
```

## Notes

- The evaluation expression must return `true` for the response topic to be published
- The response topic can include JSON objects or simple strings. If the payload is wrapped with quotes it will be treated as string and JSON otherwise.
