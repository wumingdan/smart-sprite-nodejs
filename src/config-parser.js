/*
*/

var fs = require('fs');
var path = require('path');

var utilHelper = require('./util-helper');

exports.parse = function (options) {
    var config;

    // passing a string ( url )
    if (utilHelper.isString(options)) {
        var content = fs.readFileSync(options).toString();

        config = utilHelper.jsonParse(content);
    }

    if (!config.imageOutput) {
        config.imageOutput = path.join(config.input, 'decorator');
    }

    if (!config.output) {
        config.output = config.input;
    }

    return config;
}