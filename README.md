# Zyne Language
Zyne is a templating language that allows you to add plugins that control the behavior and code generation of the language. It has a simple plugin system, so if you wanted to you could write your own plugins that use this language. The easiest target for generation is JavaScript, since it's natively what the language accepts as part of its syntax, including the strings, regular expressions, and numbers. However, you could evaluate and escape the strings, etc for any language of your choice.

## Example Usage
Here's an example of a script instance made with Zyne. You can add plugins to it as you like, and then run text on the script instance and get a transpiled result. For this example, we'll be using the RML plugin for Zyne.
```js
// Dependencies for the language and plugins.
const zyne = require('zyne');
const rml = require('zyne-rml');

// Initialize a new script.
const script = new zyne.Script();

// Register the rml plugin on the script.
script.register('rml', rml);

// Some source code to transpile.
const text = `
// Use the rml plugin.
@rml

// Define a template for the font.
font($size) -> {

	// Assign the font size in pixels.
	font-size: '\\($size)px'

	// Set the font family to sans-serif.
	font-family: sans-serif

}

// Use a font with a size of 16 pixels.
font(16)

// Create an h1 element.
h1 => {

	// Set the id to header.
	id = header
	
	// Make the text aligned to the center.
	text-align: center

	// Set the color to red.
	color: red

	// Use a font with a size of 36 pixels.
	font(36)

	// Add some text to the element.
	'Zyne Example'

}
`;

// Generate a JavaScript result from the source text and convert it to HTML.
const js = script.eval(text);
const html = eval(js);

// Log the result to the console.
console.log(html);
```

## Script Class
The constructor is simply `new zyne.Script()`

* `text = ''` The text that has been generated so far.  
* `id()` Generates a new unique identifier for this script.  
* `write(...text)` Writes a list of text to the script.  
* `register(name, plugin)` Registers a plugin with a name.  
* `unregister(name)` Unregisters a plugin by its name.  
* `directive(name, ...args)` Triggers a directive by name.  
* `trigger(name, ...data)` Triggers a handler by name.  
* `run(tokens)` Runs a list of tokens on the script.  
* `reset()` Resets the script to its original state except plugins.  
* `eval(text)` Evaluates a bit of text on the script and returns the output.  

## Plugin Class
The constructor is simply `new zyne.Plugin()`

* `set(name, handler)` Sets a directive on the plugin. Can be chained.  
* `on(name, handler)` Adds a handler to the plugin. Can be chained.  

The following handlers are available to be used.

* `init: script` When the script is initialized.  
* `exit: script` When the script is exitting.  
* `start: script` When the plugin is added.  
* `stop: script` When the plugin is removed.  
* `element: script, name, function, isBlock` Transpiles an element literal.  
* `property: script, name, content, isBlock` Transpiles a property literal.  
* `assignment: script, name, content, isBlock` Transpiles a variable assignment literal.  
* `variable: script, name, indices, isBlock` Transpiles a variable access literal.  
* `define: script, name, parameters, blocks, function, isBlock` Transpiles a function definition literal.  
* `call: script, name, arguments, functions, isBlock` Transpiles a function call literal.  
* `list: script, items, isBlock` Transpiles a list literal.  
* `code: script, text, isBlock` Transpiles a code block literal.  
* `string: script, text, isBlock` Transpiles a string literal.  
* `identifier: script, text, isBlock` Transpiles an identifier literal.  
* `number: script, text, isBlock` Transpiles a number literal.  
* `color: script, text, isBlock` Transpiles a color literal.  
* `boolean: script, text, isBlock` Transpiles a boolean literal.  
* `regex: script, text, isBlock` Transpiles a regular expression literal.  