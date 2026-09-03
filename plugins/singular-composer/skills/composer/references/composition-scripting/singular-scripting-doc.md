# Singular Composition Scripting Guide for AI Assistants

This document contains excerpts and examples from the Singular Developer Portal regarding Composition Scripting. This information is designed to assist AI in helping programmers write efficient and effective Singular Composition Scripts.

**Compatibility target:** Unless a newer runtime is explicitly guaranteed, write Singular composition scripts using **ES2017-compatible JavaScript**. ES2015-ES2017 features such as `const`, `let`, template literals, arrow functions, and `async`/`await` are acceptable. Avoid newer syntax that may fail in older browser engines, especially optional chaining (`?.`), nullish coalescing (`??`), and similar post-ES2017 conveniences.

---

## 1. Composition Scripting Overview and Fundamentals

**Composition scripting** enables the addition of JavaScript code to the underlying HTML/CSS layer of Singular overlays. This capability allows programmers to make overlays interactive and set them up to update based on defined logic. Working with composition scripts requires experience in JavaScript and sometimes CSS.

Common uses for composition scripts include:
*   **Interpreting and formatting data**, such as dates, times, colors, or adding unit symbols.
*   **Triggering animations** depending on data conditions (e.g., playing an animation when a team scores).
*   Defining **lookup-tables** and handling tri-codes.
*   Reading and writing data from/to servers.
*   Connecting to external data sources.
*   Creating interactive user experiences, and defining custom animations and transitions.

### 1.1 Types of Composition Scripts and Initialization

There are four types of composition scripts:
1.  **The global script**: Used to define global variables and library functions exposed via the global context.
2.  **The root script**: Contains root-specific functions, typically receiving or fetching data, interpreting it, and deploying the content to relevant sub-compositions.
3.  **Sub-composition scripts**: There can be one per sub-composition. These contain data and functions required within their scope and are used to access control nodes and widgets inside them.
4.  **The overlay script**: Provides the interface to communicate with parent web pages, player embed code, and native iOS and Android apps. This is only required for expert use cases.

The **initialization of composition scripts** works from the bottom up, starting from the lowest child up to the root.

**Initialization Order**:
1.  Overlay script
2.  Global script
3.  Sub-compositions (starting from the lowest child up to the parent)
4.  Root script

This order ensures that when the root script initializes, it has access to all the data and can call functions within the sub-compositions. Widgets are loaded and initialized before composition scripts run.

### 1.2 Essential Script Functions

All composition scripts must have an `init()` and a `close()` function.

*   The **`init()` function** is where custom code and variables are initialized. It provides access to a **composition object** (`comp`) and **context**.
*   The **`close()` function** is used to clean up memory, clear timeouts/intervals, and close data streams, XHR requests, etc..

#### Global Script Boilerplate

The `init` function here receives the `context` argument.

```javascript
(function() {
  // Function must return the init function. close is optional
  return {
    // the init function is called after the script has been evaluated
		// context: gives access to common objects
    init: function(context) {
      console.log("Initialize Global script ");
    },
    // the close function will be called when the script will be unloaded. 
    // use this function to cleanup timeouts, intervals, XHR request and so on
    close: function() {
      console.log("Close Global script");
    }
  };
})();
```

#### Root & Sub-composition Script Boilerplate

The `init` function here receives the `comp` (composition object) and `context` arguments.

```javascript
(function() {
  // Function must return the init function. close is optional
  return {
    // the init function is called after the script has been evaluated
    // comp: the composition object the script is attached to
		// context: gives access to common objects
    init: function(comp, context) {
      console.log("Initialize Composition script " + comp.name);
      // this listener receives messages from graphics SDK
      // these messages are usually triggered by the "send message to JavaScript" option
      // in the event panel of the composer. 
      // widgets can also send custom messages to the composition script using the  
      // sendCustomMessage of the widget SDK
      comp.addListener('message', (event, msg, e) => {
        console.log("Composition message " + comp.name, event, msg, e);
        e.stopPropagation();
      });
      // when the animation state of this comp or a sub comp changes
      comp.addListener('state_changed', (event, msg, e) => {
        console.log("Composition state " + comp.name, event, msg, e);
        e.stopPropagation();
      });
      // when the control nodes of this comp or a sub comp changes
      comp.addListener('payload_changed', (event, msg, e) => {
        console.log("Composition payload " + comp.name, event, msg);
        e.stopPropagation();
      });
      // when the payload of a datanode of this comp or a sub comp changes
      comp.addListener('datanode_payload_changed', (event, msg, e) => {
        console.log("Composition datanode payload " + comp.name, event, msg);
        e.stopPropagation();
      });
    },
    // the close function will be called when the script will be unloaded. 
    // use this function to cleanup timeouts, intervals, XHR request and so on
    close: function(comp, context) {
      console.log("Close Composition script " + comp.name);
    }
  };
})();
```

#### Overlay Script Boilerplate
```javascript
(function() {
  // Function must return the init function. close is optional
  return {
    // the init function gives you access to the graphics SDK object and the overlay SDK object
    // more information in the resources menu
    init: function(graphics, overlay) {
      console.log("Initialize Overlay script ");
      // this listener receives messages from graphics SDK
      // these messages are usually triggered by the "send message to JavaScript" option
      // in the event panel of the composer. 
      // widgets can also send custom messages to the composition script using the  
      // sendCustomMessage of the widget SDK
      graphics.addListener('message', (event, msg) => {
        console.log("Graphics SDK message", event, msg);
      });
      // when the animation state of a sub composition changes
      graphics.addListener('state_changed', (event, msg) => {
        console.log("Graphics SDK state changed", event, msg);
      });
      // when the control nodes of a sub composition changes
      graphics.addListener('payload_changed', (event, msg) => {
        console.log("Graphics SDK payload changed", event, msg);
      });
      // when the payload of a datanode in the composition changes
      graphics.addListener('datanode_payload_changed', (event, msg) => {
        console.log("Graphics SDK datanode payload changed", event, msg);
      });
      // errors will be reported here
      graphics.addListener('error', (event, msg) => {
        console.log("Graphics SDK error", event, msg);
      });
      // overlay only exists if the composition is instanciated using the Overlay SDK
      // more info in the resources menu
      if (overlay) {
        overlay.addListener((event, msg) => {
          console.log("Overlay SDK message", event, msg);
        });
      }
    },

    // the close function will be called when the script will be unloaded. 
    // use this function to cleanup timeouts, intervals, XHR request and so on
    close: function() {
      console.log("Close Overlay script");
    }
  };
})();
```


## 2. Objects and Methods Reference

### 2.1 The Composition Object (`comp`)

The composition object provides methods to navigate the composition structure, read and update content, transformation/effects parameters, access the DOM element, and trigger animations.

| Method/Property | Description |
| :--- | :--- |
| `find()` | Returns an array of composition objects matching the search string. |
| `findGroup()` | Returns an array of group objects matching the search string. |
| `findWidget()` | Returns an array of widget objects matching the search string. |
| `getPayload()` | Returns control node content as an array of key-value pairs. |
| `getPayload2()` | Returns control node content as a JSON object. |
| `setPayload(i)` | Sets the control node content of the composition. |
| `getState()` | Returns the current animation state as a logical name (`"In"` or `"Out"`). Internal states like `"Out1"` are normalized. |
| `jumpTo(state)` | Immediately jumps to the specified animation state. No animation plays. Fires `timeline_event` with `event: "jump"`. Fires `state_changed` only if the state actually changes. |
| `playTo(state)` | Plays the animation to the specified state. Returns immediately; animation plays asynchronously. Fires `timeline_event` with `event: "start"` then `event: "stop"`, and `state_changed` on completion. |
| `id` | The composition ID. |
| `name` | The composition name. |
| `parent()` | Returns the parent composition object. |
| `listSubcompositions()` | Returns an array of JSON objects containing sub-composition names and IDs. |

#### Composition Object Usage Examples

**Finding Objects**:
Objects can have the same name, find*** methods return an array
```javascript
// We use the first composition with the matching name   
const compClock = comp.find("Clock")[0];

// We use the first group with the matching name   
const groupLowers = comp.findGroup("Lowers Group")[0];

// We use the first widget with the matching name   
const wiTitle = comp.findWidget("Title")[0];   
// Find the first matching widget in a group   
const wiTeam1Name = comp.findWidget("Team1 Group", "teamName")[0];
```

**Getting/Setting Payload**:

```javascript
// Returns payload as JSON object
const payload = comp.getPayload2();   
console.log(payload); 

// Sets the control node content 
const payload = {"Title": "The Title"};   
comp.setPayload(payload);
```

If a control node model has type `table`, the value passed to `setPayload()` for that control node should be an array of row objects whose keys match the table column IDs/titles.

```javascript
const payload = {
  "t1": [{
    "Name": "Test",
    "Height": "100.0"
  }]
};

comp.setPayload(payload);
```

### 2.2 The Widget Object (`widget`)

The widget object provides methods to read and update widget specific properties, transformation and effects parameters, and access the `Dom` element.

| Method/Property | Description |
| :--- | :--- |
| `getPayload()` | Returns widget type specific properties as a JSON object. |
| `setPayload(o)` | Sets one or multiple widget specific properties. Prefer using dedicated methods like `setSizeX()`, `setSizeY()` for dimensions instead of `setPayload()`. |
| `getDomElement(t)` | Returns the HTML `Dom` element for the widget. |
| `getPositionX()`, `getPositionY()` | Returns position in [-50, 50] coordinate space. 0 = center. Anchor point is center by default. |
| `setPositionX(o)`, `setPositionY(o)` | Sets position in [-50, 50] coordinate space. 0 = center. Anchor point is center by default. |
| `getSizeX()`, `getSizeY()` | Returns size as percentage (0-100) of the canvas. |
| `setSizeX(o)`, `setSizeY(o)` | Sets size as percentage (0-100) of the canvas. |
| `getVisibility()` | Returns visibility as a boolean. |
| `setVisibility(o)` | Sets visibility as a boolean. |

#### [BEST PRACTICE] Widget Dimensions

**Always prefer `setSizeX()` and `setSizeY()` methods for widget dimensions unless the user specifically requests `setPayload()`.**

- ✅ PREFERRED: `widget.setSizeX(50)` // Sets width to 50% of canvas
- ✅ PREFERRED: `widget.setSizeY(30)` // Sets height to 30% of canvas
- ⚠️ AVOID: `widget.setPayload({width: 50, height: 30})` // Works but not recommended

**Why use dedicated methods:**
- More explicit and readable
- Consistent with position, opacity, and other transform methods
- Widget-agnostic approach that works for all widget types

**When to use `setPayload()`:** Only for widget-specific content properties (text, url, table content, etc.) or when explicitly requested by the user.

**Widget Payload Example**:

```javascript
// Preferred approach: dedicated methods for dimensions
wiText.setSizeX(50);
wiText.setSizeY(20);

// setPayload for content properties
wiText.setPayload({"text": "The new title"});
```

### 2.3 The Group Object (`group`)

The group object provides methods to read and update group-specific properties, transformation and effects parameters, and access the `Dom` element.

| Method/Property | Description |
| :--- | :--- |
| `getDomElement()` | Returns the HTML `Dom` element for the group. |
| `getPositionX()`, `getPositionY()` | Returns position in [-50, 50] coordinate space. 0 = center. Anchor point is center by default. |
| `setPositionX(o)`, `setPositionY(o)` | Sets position in [-50, 50] coordinate space. 0 = center. Anchor point is center by default. |
| `getSizeX()`, `getSizeY()` | Returns size as percentage (0-100) of the canvas. |
| `setSizeX(o)`, `setSizeY(o)` | Sets size as percentage (0-100) of the canvas. |
| `getVisibility()` | Returns visibility as a boolean. |
| `setVisibility(o)` | Sets visibility as a boolean. |
| `getRotateZ()` | Returns rotation value in degrees. |
| `setRotateZ(o)` | Sets rotation value in degrees. |
| `getOpacity()` | Returns opacity value (0-1). |
| `setOpacity(o)` | Sets opacity value (0-1). |
| `getBrightness()`, `getBlur()`, `getContrast()`, `getGrayscale()`, `getHue()`, `getInvert()`, `getSaturate()`, `getSepia()` | Returns filter effect values. |
| `setBrightness(o)`, `setBlur(o)`, `setContrast(o)`, `setGrayscale(o)`, `setHue(o)`, `setInvert(o)`, `setSaturate(o)`, `setSepia(o)` | Sets filter effect values. |
| `getBorderRadius()` | Returns border radius configuration as an object with `active`, `tl`, `tr`, `bl`, `br` properties. |
| `setBorderRadius(o)` | Sets border radius values with properties `active`, `tl`, `tr`, `bl`, `br`. |
| `id` | The group ID. |

#### Finding Groups

Use `comp.findGroup()` to find and get references to group objects by name. This method returns an array of group objects.

**Finding Groups Example**:
```javascript
// Find the first group with the matching name   
const groupLowers = comp.findGroup("Lowers Group")[0];

// Get position of the group
const xPos = groupLowers.getPositionX();
const yPos = groupLowers.getPositionY();
```

**Group Payload Example**:

```javascript
// Sets group position and visibility
groupLowers.setPositionX(50);
groupLowers.setPositionY(25);
groupLowers.setVisibility(true);

// Sets group size
groupLowers.setSizeX(40);
groupLowers.setSizeY(30);

// Sets filter effects
groupLowers.setOpacity(0.8);
groupLowers.setBlur(5);
```

### 2.4 Context and Utility Functions

The `context` object provides access to common objects, including global storage and utility functions.

| Utility Function | Description |
| :--- | :--- |
| `global: {}` | A custom global object for variables, objects, and functions. |
| `utils.createDataStream()` | Creates a data stream listener. |
| `utils.createMoment()` | Creates a momentjs object. |
| `utils.createTinyColor()` | Creates a tinycolor object. |
| `utils.getSingularWindow()` | Returns the render window name (e.g., `app_output`, `app_control`, or `script_editor`). |

**Example using `utils.createDataStream()`**:
[Create and close a Data Stream]
```javascript
(function() {
  const data_stream_public_token = "your-data-stream-public-token";
  // we define the datas tream variable in the global scope
  let datastream = undefined;
  return {
    init: function(comp, context) {
      // we create the data stream object using the public token
      datastream = context.utils.createDataStream(data_stream_public_token,
        (status, message) => {
          switch (status) {
            case "message":
              console.log("we have received data:", status, message);
              comp.setPayload({name: message.payload.name});
              break;
            case "connecting":
            case "connect":
            case "open":
            case "close":
            case "disconnect":
              console.log("status:", status);
              break;
            case "error":
              console.error("error:", status);
              break;
          }
        });
    },
    close: function(comp, context) {
      // we close the data stream connection
      if (datastream != undefined) {
        datastream.close();
      }
    }
  };
})();
```

### 2.5 Event Listeners

The `comp.addListener (eventType, callbackFunction)` method attaches an event handler to the composition without overwriting existing handlers.

For a root or sub-composition script, the callback contract is `function(event, msg, propagationEvent)`: `event` is the event-name string, `msg` is the structured message, and `propagationEvent.stopPropagation()` stops the event from continuing to parent compositions. This is distinct from the host-page Player SDK, whose listener contract is `function(event, msg)` and has no third propagation object. For `payload_changed`, read the new values from `comp.getPayload2()`; use `msg.compositionId` when the script must ignore events propagated from child compositions.

Available `eventType` options include:
*   `payload_changed`: Occurs when the control nodes of the composition or a sub-composition change.
*   `timeline_event`: **(preferred over `state_changed`)** Fired directly from the animation engine. Occurs at the start (`event: "start"`), end (`event: "stop"`), or when jumping (`event: "jump"`). Message includes `msg.compositionId`, `msg.message.event`, and `msg.message.targetState`.
*   `state_changed`: Occurs when the animation state changes (after a `playTo()` animation completes or a `jumpTo()` causes an actual state change). Message includes `msg.compositionId` and `msg.state` (the new internal state name, e.g., `"In"` or `"Out1"`). Prefer `timeline_event` when you need the exact start/stop timing of the animation.
*   `datanode_payload_changed`: Occurs when a data node changes.
*   `message`: Occurs when the Graphics SDK, widgets, and interactive events send custom messages.
*   `button_clicked`: Occurs when a button control node (model with type = 'button') is clicked.

**Example `payload_changed` Listener**:

```javascript
comp.addListener('payload_changed', (event, msg, e) => {    if (msg.compositionId === comp.id) {    console.log("listen to:", event);    console.log("msg:", msg);    }    e.stopPropagation();   });
```

**Example `button_clicked` Listener**:

```javascript
 comp.addListener('button_clicked', (event, msg, e) => { console.log(`Button ${msg.buttonId} from comp [id: ${msg.compId}, name: ${msg.compName}] is clicked`); e.stopPropagation(); });
```

## 2.6 Animation Control

Composition scripts control **composition-level** In/Out animation states using `comp.playTo()` and `comp.jumpTo()`. These methods control the entire composition's timeline — individual tile keyframes and effects within the composition are baked into the design and not directly scriptable.

### playTo vs jumpTo

| Method | Behavior | Events Fired |
|--------|----------|-------------|
| `comp.playTo(state)` | Plays the animation to the target state. Returns immediately; the animation completes asynchronously. | `timeline_event` with `event: "start"` → animation plays → `state_changed` → `timeline_event` with `event: "stop"` |
| `comp.jumpTo(state)` | Instantly jumps to the target state without playing any animation. | `timeline_event` with `event: "jump"`. `state_changed` fires only if the state actually changes. |

### State values

- `"In"` — the composition is visible/active
- `"Out"` — the composition is hidden/inactive

Internally, `"Out"` may resolve to `"Out1"` (the internal timeline state). The `state_changed` event reports the internal state name (`"Out1"`), while `comp.getState()` returns the logical name (`"Out"`). Additional intermediate states (`Out1`, `Out2`) exist for staggered animations.

### Prefer timeline_event over state_changed

`timeline_event` is fired directly from the animation engine and is the recommended event for reacting to animation state changes. `state_changed` is a downstream convenience event that only fires after the state has fully settled — it cannot distinguish start from end and does not fire for no-op transitions.

| | `timeline_event` (preferred) | `state_changed` |
|---|---|---|
| Source | Animation engine (direct) | State engine (downstream) |
| Fires on playTo start | Yes, `event: "start"` | No |
| Fires on playTo end | Yes, `event: "stop"` | Yes |
| Fires on jumpTo (state changes) | Yes, `event: "jump"` | Yes |
| Fires on jumpTo (no-op) | Yes, `event: "jump"` | No |

### Event message structures

**`timeline_event` listener** (preferred) receives a `msg` object with:
- `msg.compositionId` — the composition ID
- `msg.message.event` — one of `"start"` (animation began), `"stop"` (animation ended), `"jump"` (jumpTo)
- `msg.message.targetState` — the target state of the transition (e.g., `"In"`, `"Out1"`)

**`state_changed` listener** receives a `msg` object with:
- `msg.compositionId` — the composition ID that changed state
- `msg.state` — the new internal state (e.g., `"In"`, `"Out1"`)

### Animation control examples

**Play to In, then jump to Out:**
```javascript
// Play the animation to In (with animation)
comp.playTo('In');

// Jumps to Out instantly (no animation)
comp.jumpTo('Out');
```

**React to animation events (prefer `timeline_event`):**
```javascript
// PREFERRED: timeline_event — fired directly from the animation engine
comp.addListener('timeline_event', (event, msg, e) => {
  if (msg.compositionId === comp.id) {
    const ev = msg.message;
    if (ev.event === "start") {
      console.log("Animation started toward:", ev.targetState);
    } else if (ev.event === "stop") {
      console.log("Animation completed to:", ev.targetState);
    } else if (ev.event === "jump") {
      console.log("Jumped to state:", ev.targetState);
    }
  }
  e.stopPropagation();
});

// state_changed — downstream event, fires only after state settles
comp.addListener('state_changed', (event, msg, e) => {
  if (msg.compositionId === comp.id) {
    console.log("State changed to:", msg.state);
  }
  e.stopPropagation();
});
```

**Check current state:**
```javascript
const current = comp.getState();
if (current === "In") {
  // composition is visible
} else {
  // composition is hidden
}
```

### Important notes

- **Prefer `timeline_event` over `state_changed`** — `timeline_event` is fired directly from the animation engine and provides both start and stop timing. `state_changed` is a downstream event that only fires after the state settles and cannot distinguish animation start from end.
- `playTo()` is asynchronous — `comp.getState()` returns the current (pre-animation) state immediately after calling `playTo()`. Use `timeline_event` with `event: "stop"` to confirm the animation completed.
- Events propagate up the composition hierarchy. Always check `msg.compositionId === comp.id` to filter events originating from the current composition.
- Calling `jumpTo('In')` when the state is already `"In"` is a no-op: it fires `timeline_event` with `event: "jump"` but no `state_changed`.
- Composition-level animation control only affects the composition's own In/Out timeline, not individual tile keyframes or widget effects.

## 3. Best Practices and Communication

### 3.1 Communication Between Sub-compositions

An efficient method for exchanging data between sub-compositions is by adding functions (like `updateContent()`) directly to the composition object.

#### Receiving Data in a Sub-composition

Extend the composition object by adding the function `updateContent()` to the comp object.
[Lower subcomposition Script]
```javascript
(function() {
  return {
    init: function(comp, context) {
      console.log("Initialize Composition script " + comp.name);
      // extend the composition object
      // receive data in the updateContent function
      comp.updateContent = function(data) {
        console.log("updateContent() - data =", data);
      }
    },
    close: function(comp, context) {
      console.log("Close Composition script " + comp.name);
    }
  };
})();
```

#### Sending Data to a Sub-composition

Get a reference to the receiving composition and send data by calling its `updateContent()` function.
[Root Script]
```javascript
((function() {
  return {
    init: function(comp, context) {
      console.log("Initialize Composition script " + comp.name);
      // get composition reference
      const compLower = comp.find("Lower")[0];
      comp.addListener('payload_changed', (event, msg, e) => {
        console.log("Composition payload " + comp.name, event, msg);
        const payload = comp.getPayload2();
        // send data to destination
        compLower.updateContent(payload);
        e.stopPropagation();
      });
    },
    close: function(comp, context) {
      console.log("Close Composition script " + comp.name);
    }
  };
})();
```

### 3.2 Updating Overlay Content from the Composition Script

When a sub-composition receives data in control nodes, interprets it, and updates internal properties, it is recommended practice to **unlink the receiving control nodes from properties** and directly update widget properties instead.

#### Example: Reading control nodes, generating HTML, and updating a widget’s text property

This script reads `firstname` and `lastname` from control nodes (via `comp.getPayload2()`), formats it into HTML, and updates a widget (`wiFullname`) via `setPayload()`.
[Lower subcomposition Script]
```javascript
(function() {
  return {
    init: function(comp, context) {
      console.log("Initialize Composition script " + comp.name);
      const wiFullname = comp.findWidget("fullname")[0];
      comp.addListener('payload_changed', (event, msg, e) => {
        console.log("Composition payload " + comp.name, event, msg);
        // read control nodes content
        const p = comp.getPayload2();
        const htmlText = `<html>${p.firstname} <b>${p.lastname}</b></html>`;
        // update text widget
        wiFullname.setPayload({
          "text": htmlText
        });
        e.stopPropagation();
      });
    },
    close: function(comp, context) {
      console.log("Close Composition script " + comp.name);
    }
  };
})();
```

## 4. Quick Start Use Cases

The following examples demonstrate fundamental composition scripting tasks.

### 4.1 Finding Sub-compositions and Widgets

This example demonstrates how to get references to sub-compositions and widgets using `comp.find()` and `comp.findWidget()`.

**Root Script** (Find Sub-composition "Lower"):
[Root Script]
```javascript
(function() {
  return {
    init: function(comp, context) {
      // get reference to the subcomposition "Lower"
      const compLower = comp.find("Lower")[0];
      // log composition object to the console
      console.log(compLower);
    },
    close: function(comp, context) {}
  };
})();
```

**Lower Script** (Find Widgets within "Lower"):
[Lower Script]
```javascript
(function() {
  return {
    init: function(comp, context) {
      // get reference to the title, subtitle, and logo widget
      const wiLowerTitle = comp.findWidget("lowerTitle")[0];
      const wiLowerSubtitle = comp.findWidget("lowerSubtitle")[0];
      const wiLowerLogo = comp.findWidget("lowerLogo")[0];
      // log widget objects to the console
      console.log(wiLowerTitle);
      console.log(wiLowerSubtitle);
      console.log(wiLowerLogo);
    },

    close: function(comp, context) {}
  };
})();
```

### 4.2 Reading and Updating Control Nodes

This example shows how to read control node payload using `getPayload()` (array of key-value pairs) and `getPayload2()` (JSON object), and how to update control node content using `setPayload()`.
[Lower Script]
```javascript
(function() {
  return {
    init: function(comp, context) {
      console.log("Initialize Composition script " + comp.name);
      const wiFullname = comp.findWidget("fullname")[0];
      comp.addListener('payload_changed', (event, msg, e) => {
        console.log("Composition payload " + comp.name, event, msg);
        // read control nodes content
        const p = comp.getPayload2();
        const htmlText = `<html>${p.firstname} <b>${p.lastname}</b></html>`;
        // update text widget
        wiFullname.setPayload({
          "text": htmlText
        });
        e.stopPropagation();
      });
    },
    close: function(comp, context) {
      console.log("Close Composition script " + comp.name);
    }
  };
})();
```

### 4.3 Reading Control Nodes and Updating Widget Properties

This example demonstrates reading data from control nodes and using that data to update a widget property (concatenating strings and changing the case of the last name).
[Lower Script]
```javascript
(function() {
  return {
    init: function(comp, context) {
      // get reference to the fullname widget
      const wiLowerFullname = comp.findWidget("lowerFullname")[0];
      // get control node payload as JSON object
      const p = comp.getPayload2();
      console.log(p);
      // concat control node content and change the lastname to upper case.
      const fullname = `${p["Firstname"]} ${p["Lastname"].toUpperCase()}`;
      // update fullname text
      wiLowerFullname.setPayload({
        "text": fullname
      });
    },
    close: function(comp, context) {}
  };
})();
```

### 4.4 Set Text Widget Text Properties

This example shows how to update single-line and multi-line text widget properties using `setPayload()`.
[Lower Script]
```javascript
(function() {
  return {
    init: function(comp, context) {
      // get reference to the title and subtitle widget
      const wiLowerTitle = comp.findWidget("lowerTitle")[0];
      const wiLowerSubtitle = comp.findWidget("lowerSubtitle")[0];
      // update the single-line title
      wiLowerTitle.setPayload({
        "text": "This is the new title"
      });
      // update the multi-line subtitle
      wiLowerSubtitle.setPayload({
        "text": "New subtitle line 1\nNew subtitle line 2"
      });
    },
    close: function(comp, context) {}
  };
})();
```

### 4.5 Set Image Widget URL Property

This script demonstrates setting the URL property of an image widget using `findWidget()` and `setPayload()`.
[Lower Script]
```javascript
(function() {
  return {
    init: function(comp, context) {
      // get reference to the logo widget
      const wiLowerLogo = comp.findWidget("lowerLogo")[0];
      // log widget object to the console
      console.log(wiLowerLogo);
      // update the image URL
      wiLowerLogo.setPayload({
        "image": "https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png"
      });
    },
    close: function(comp, context) {}
  };
})();
```

### 4.6 Setting Widget Size and Position

This example demonstrates the preferred way to resize and reposition widgets dynamically.
[Lower Script]
```javascript
(function() {
  return {
    init: function(comp, context) {
      // get reference to a text widget
      const wiTitle = comp.findWidget("Title")[0];
      
      // ✅ PREFERRED: Use dedicated dimension methods
      wiTitle.setSizeX(80);  // Set width to 80% of canvas
      wiTitle.setSizeY(15);  // Set height to 15% of canvas
      
      // Set widget position in [-50, 50] coordinate space (0 = center, center-anchored)
      wiTitle.setPositionX(-40);  // left side
      wiTitle.setPositionY(-35);  // upper area
      
      // Use setPayload for widget-specific content
      wiTitle.setPayload({text: "My Title"});
      
      // You can also combine multiple updates
      const wiLogo = comp.findWidget("Logo")[0];
      wiLogo.setSizeX(20);
      wiLogo.setSizeY(20);
      wiLogo.setPayload({url: "https://example.com/logo.png"});
    },
    close: function(comp, context) {}
  };
})();
```

### 4.7 Set Table Widget Content Property

This example demonstrates how to update a table widget's content. Note that the content object must be stringified before being passed to `setPayload()`.
[Standings Script]
```javascript
(function() {
  return {
    init: function(comp, context) {
      // get reference to the standingsTable widget
      const wiStandingsTable = comp.findWidget("standingsTable")[0];
      // log widget objects to the console
      console.log(wiStandingsTable);
      // define standings data
      const tableData = [{
          "Position": 1,
          "Name": "The Winner",
          "Points": 987
        },
        {
          "Position": 2,
          "Name": "Silver medal",
          "Points": 876
        },
        {
          "Position": 3,
          "Name": "Bronce medal",
          "Points": 765
        },
        {
          "Position": 4,
          "Name": "4th place",
          "Points": 654
        },
        {
          "Position": 5,
          "Name": "5th place",
          "Points": 543
        }
      ];
      // build table content format
      const tableContent = {
        "content": tableData
      };
      // update tableContent widget property
      // we stringify the tableContent!
      wiStandingsTable.setPayload({
        "tableContent": JSON.stringify(tableContent)
      });
    },

    close: function(comp, context) {}
  };
})();
```

### 4.7 Reading Control Nodes, Generating HTML Text with Auto-Sizing Background

This example demonstrates using the text widget’s HTML feature to style text and set an auto-sizing background color dynamically, relying on `utils.createTinyColor()` for color parsing.
[Lower script]
```javascript
(function() {
  const HTML_TEMPLATE = '<html><span style="background:{{background-color}}; padding: 0px {{padding-right}}px 0px {{padding-left}}px">{{firstname}} <b>{{secondname}}</b></span></html>';
  // convert color JSON to CSS rgba()
  const parseColor = function(color) {
    const colorRgba = `rgba(${color.r}, ${color.g}, ${color.b}, ${color.a})`;
    // console.log("colorRgba =", colorRgba);
    return colorRgba;
  }
  return {
    init: function(comp, context) {
      // get reference to the fullname widget
      const wiLowerText = comp.findWidget("lowerText")[0];
      /**********************************************************************/
      // we define a function to update the composition
      function updateComposition() {
        // get control node payload as JSON object
        const p = comp.getPayload2();
        console.log(p);
        const colorRgba = parseColor(p["Background Color"]);
        // build HTML text.
        let htmlText = HTML_TEMPLATE.replace(/{{background-color}}/gi, colorRgba);
        htmlText = htmlText.replace(/{{padding-right}}/gi, p["Padding Right"]);
        htmlText = htmlText.replace(/{{padding-left}}/gi, p["Padding Left"]);
        htmlText = htmlText.replace(/{{firstname}}/gi, p["Firstname"]);
        htmlText = htmlText.replace(/{{secondname}}/gi, p["Lastname"]);
        // update fullname text
        wiLowerText.setPayload({
          "text": htmlText
        });
      }
      /**********************************************************************/
      // we listen to payload_changed events
      comp.addListener('payload_changed', (event, msg, e) => {
        updateComposition();
        e.stopPropagation();
      });
      /**********************************************************************/
      // update the composition when loading the output URL
      updateComposition();
    },
    close: function(comp, context) {}
  };
})();
```

### 4.8 Text Ticker - Start Ticker on "In" Animation

This script uses the `timeline_event` listener to start a Text Ticker widget crawl specifically when the subcomposition enters the "In" animation state (`m.event == "start" && m.targetState == "In"`). It resets the ticker speed to 0, updates the messages based on the control node payload, and then sets the speed back to the stored value to restart the crawl.
[Text Ticker]
```javascript
(function() {
  return {
    init: function(comp, context) {
      console.log("Initialize Composition script " + comp.name);
      // we get the Text Ticker widget object
      const wiTextTicker = comp.findWidget("Text Ticker")[0];
      /**********************************************************************/
      // we listen to timeline events
      comp.addListener('timeline_event', (event, msg, e) => {
        // quick exit if a child composition propagated the event
        if (msg.compositionId != comp.id) return;
        const m = msg.message;
        // we reset and set the Text Ticker's speed on the "In" animation start
        if (m.event == "start" && m.targetState == "In") {
          const p = comp.getPayload2();
          // we remember the current ticker speed
          const speed = wiTextTicker.getPayload()["speed"];
          // we reset the speed and the message text
          wiTextTicker.setPayload({
            "speed": 0
          });
          // we set the ticker speed and update messages
          wiTextTicker.setPayload({
            "speed": speed,
            "text": p["Messages"]
          });
        }

        e.stopPropagation();
      });
      /**********************************************************************/
      // we listen to payload / control node changes
      comp.addListener('payload_changed', (event, msg, e) => {
        // quick exit if a child composition propagated the event
        if (msg.compositionId != comp.id) return;
        const p = comp.getPayload2();
        wiTextTicker.setPayload({
          "text": p["Messages"]
        });
        e.stopPropagation();
      });
    },
    close: function(comp, context) {
      console.log("Close Composition script " + comp.name);
    }
  };
})();
```

## 5 Common pitfalls [CRITICAL]

### Browser compatibility baseline [CRITICAL]
- Default to **ES2017-compatible JavaScript** when writing Singular scripts unless the runtime is explicitly known to support newer syntax.
- ES2015-ES2017 syntax such as arrow functions and `async`/`await` is allowed; the goal is to avoid features introduced after ES2017 when targeting older browsers.
- Avoid post-ES2017 syntax in shared examples and generated scripts, especially optional chaining (`?.`), nullish coalescing (`??`), and similar newer language features that may fail in older browsers.

### Preferring dedicated dimension methods [CRITICAL]
- **Always use `setSizeX()`, `setSizeY()` for widget and group dimensions** unless the user explicitly requests `setPayload()`.
- While some widgets support `setPayload({width: X, height: Y})`, the dedicated methods are the recommended approach.
- Benefits: Better readability, consistency across all widget types, and alignment with other transform methods.
- Default to dedicated methods (`setSizeX`, `setSizeY`, `setPositionX`, `setPositionY`, `setOpacity`, etc.) for all dimension and transform properties.
- Reserve `setPayload()` primarily for widget-specific content (text, url, table data, etc.).

### HTML strings with absolute CSS units
- If HTML strings include inline CSS that uses absolute units (for example: px, pt, cm), show a warning because absolute units can reduce layout responsiveness. Recommend replacing them with percentage (%) units only. Do not suggest other relative units such as em, rem, vw, vh, ex, ch, vmin, or vmax.
