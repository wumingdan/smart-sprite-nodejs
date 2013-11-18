//url(../images/app_icon.png) white no-repeat 10px 50% border-box content-box fixed
(function () {

    var MATCH_ACTION = [{
        //background-image
        regexp: /\b(url\([^\)]+\))/i,
        exec: function (style, match) {
            style['background-image'] = match[1];
        }
    }, {
        //background-repeat
        regexp: /((no-repeat)|(repeat-x)|(repeat-y)|(repeat))/i,
        exec: function (style, match) {
            style['background-repeat'] = match[1];
        }
    }, {
        //background-attachment
        regexp: /\b(fixed|scroll)\b/i,
        exec: function (style, match) {
            style['background-attachment'] = match[1];
        }
    }, {
        //background-origin, background-clip
        //使用简写的时候 origin 是比 clip 优先的
        regexp: /(\b(border|padding|content)-box)/i,
        exec: function (style, match) {
            style['background-origin'] = match[1];
        }
    }, {
        //background-clip
        regexp: /(\b(border|padding|content)-box)/i,
        exec: function (style, match) {
            style['background-clip'] = match[1];
        }
    }, {
        //background-position-x
        //w3c 中 position 的两个值必须写在一起(如果有两个的话)
        regexp: /(^-?\d+(%|in|cm|mm|em|ex|pt|pc|px)?)|\b(center|right|left)\b/i,
        exec: function (style, match) {
            style['background-position-x'] = match[1] || match[3];
        }
    }, {
        //background-position-y
        regexp: /(^-?\d+(%|in|cm|mm|em|ex|pt|pc|px)?)|\b(center|top|bottom)\b/i,
        exec: function (style, match) {
            style['background-position-y'] = match[1] || match[3];
        }
    }, {
        //background-color: #fff
        regexp: /(^#([0-9a-f]{3}|[0-9a-f]{6})\b)/i,
        exec: function (style, match) {
            style['background-color'] = match[1];
        }
    }, {
        //background-color: rgb()
        regexp: /(\brgb\(\s*(1[0-9]{2}|2[0-4][0-9]|25[0-5]|[1-9][0-9]|[0-9])\s*(,\s*(1[0-9]{2}|2[0-4][0-9]|25[0-5]|[1-9][0-9]|[0-9])\s*){2}\))/i,
        exec: function (style, match) {
            style['background-color'] = match[1];
        }
    }, {
        //background-color: rgba()
        regexp: /(\brgba\((\s*(1[0-9]{2}|2[0-4][0-9]|25[0-5]|[1-9][0-9]|[0-9])\s*,){3}\s*(0?\.[0-9]+|[01])\s*\))/i,
        exec: function (style, match) {
            style['background-color'] = match[1];
        }
    }, {
        //background-color: color-name
        //W3C 的 HTML 4.0 标准仅支持 16 种颜色名, 加上 orange + transparent 一共 18 种 
        regexp: /\b(aqua|black|blue|fuchsia|gray|green|lime|maroon|navy|olive|purple|red|silver|teal|white|yellow|orange|transparent)\b/i,
        exec: function (style, match) {
            style['background-color'] = match[1];
        }
    }];

    var removeStyleAttr = function (style, attr) {
        if (!style[attr]) {
            return;
        }
        delete style[attr];
        for (var i = 0, item; item = style[i]; i++) {
            if (item === attr) {
                for (var j = i; j < style.length - 1; j++) {
                    style[j] = style[j + 1];
                }
                delete style[style.length--];
                break;
            }
        };
    }

    var mergeStyleAttr = function (style, exStyle) {
        for (var i in exStyle) {
            if (style[i]) {
                continue;
            }
            style[i] = exStyle[i];
            style[style.length++] = i;
        }

    }

    exports.analyse = function (value) {
        //处理多 background 简写的情况
        var values = value.split(',');
        var list = [],
            style,
            has,
            match;
        for (var i = 0; i < values.length; i++) {
            value = values[i].trim();
            style = {};
            has = false;
            for (var j = 0, action;
                (action = MATCH_ACTION[j]) && value; j++) {
                match = value.match(action.regexp);
                if (match) {
                    action.exec(style, match);
                    value = value.replace(match[0], '').trim();
                    has = true;
                }
            };
            if (has) {
                list.push(style);
            }
        };

        return list;
    };

    exports.split = function (style) {
        var background;
        var value;

        // background-position
        if (value = style['background-position']) {
            value = value.trim().replace(/\s{2}/g, '').split(' ');

            if (!value[1]) {
                value[1] = value[0];
            }

            style['background-position-x'] = value[0];
            style['background-position-y'] = value[1];
        }

        background = this.analyse(style.background);

        if (background.length != 1) {
            //TODO 暂时跳过多背景的属性
            return;
        }

        background = background[0];
        if (background['background-image']) {
            removeStyleAttr(style, 'background');
            mergeStyleAttr(style, background);
        }
    };

    exports.merge = function (style) {
        var background = '';

        var bgPositionX = (('background-position-x' in style) ? style['background-position-x'] : '');
        var bgPositionY = (('background-position-y' in style) ? style['background-position-y'] : '');

        style['background-position'] = (bgPositionX + ' ' + bgPositionY).trim();

        removeStyleAttr(style, 'background-position-x');
        removeStyleAttr(style, 'background-position-y');

        var attrList = [
            'background-color', 'background-image', 'background-position', 'background-repeat',
            'background-attachment', 'background-origin', 'background-clip'
        ];

        for (var i = 0, item; item = attrList[i]; i++) {
            if (style[item]) {
                background += style[item] + ' ';
                removeStyleAttr(style, item);
            }
        }
        style['background'] = background.trim();
        style[style.length++] = 'background';
    };

    exports.getMarginInfo = function (spriteInfo) {
        var result = [0, 0, 0, 0];

        var marginTop, marginRight, marginBottom, marginLeft;

        if (spriteInfo != undefined) {
            marginTop = spriteInfo['sprite-margin-top'];
            marginRight = spriteInfo['sprite-margin-right'];
            marginBottom = spriteInfo['sprite-margin-bottom'];
            marginLeft = spriteInfo['sprite-margin-left'];

            if (marginTop) {
                result[0] = parseInt(marginTop);
            }

            if (marginRight) {
                result[1] = parseInt(marginRight);
            }

            if (marginBottom) {
                result[2] = parseInt(marginBottom);
            }

            if (marginLeft) {
                result[3] = parseInt(marginLeft);
            }
        }

        return result;
    };
})();