


var fs = require('fs');
var readline = require('readline');
var path = require('path');
var util = require('util');

var cssom = require('cssom');

var utilHelper = require('./util-helper');
var fileHelper = require('./file-helper');

var spriteDefineReg = /\*+\s+(sprite:[^*]*)\*+/;


var styleSheetToString = function (styleSheet) {
    var result = "";
    var rules = styleSheet.cssRules, rule;
    for (var i = 0; i < rules.length; i++) {
        rule = rules[i];
        if (rule instanceof cssom.CSSImportRule) {
            result += styleSheetToString(rule.styleSheet) + '\n';
        } else {
            result += rule.cssText + '\n';
        }
    }
    return result;
};

/**
 * Method for parsing SmartSprites directives string to Object
 */
var parserDirectives = function (directives) {
    var result = {};

    if (!directives) return result;

    // remove the comment 
    directives = directives.replace(/\/\*\*|\*\//g, '');

    var parts = directives.split(';');

    for (var i = 0; i < parts.length; i++) {
        var part = parts[i];

        var chunks = part.split(':');

        if (chunks.length == 2) { 
            var key = chunks[0].trim();
            var value = chunks[1].trim();

            result[key] = value;
        }
        // TODO: else, warnning report
    };

    return result;
};

exports.read = function (filePath) {
    var content = fs.readFileSync(filePath);

    return content;
};

exports.getStyleSheet = function (filePath) {
    var content = this.read(filePath);

    var styleSheet = cssom.parse(content.toString());

    return styleSheet;
};

exports.getCssRules = function (filePath) {
    var styleSheet = this.getStyleSheet(filePath);

    return styleSheet.cssRules;
};

/**
 * Method for collecting SmartSprites directives from CSS files.
 * return: array of spriteImageNames
 */
exports.getSpriteDefinitions = function (filePath, callback) {
    var result = [];

    var rd = readline.createInterface({
        input: fs.createReadStream(filePath),
        output: process.stdout,
        terminal: false
    });

    rd.on('line', function (line) {
        if (spriteDefineReg.test(line)) {
            result.push(parserDirectives(line));
        }
    });

    rd.on('close', function(){
        callback(result);
    });  
}

exports.write = function (spriteObjList, outputRoot) {
    if (!util.isArray(spriteObjList)) {
        spriteObjList = [spriteObjList];
    }

    var fileName,
        spriteObj,
        cssContentList = [];

    for (var i in spriteObjList) {
        spriteObj = spriteObjList[i];
        fileName = path.resolve(outputRoot + spriteObj.fileName);

        fileHelper.writeFileSync(fileName, styleSheetToString(spriteObj.styleSheet), true);
    }
};