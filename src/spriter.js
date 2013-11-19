/*
    @name: hm-sprite
    @description: implemention of http://csssprites.org/
*/

var path = require('path');
var fs = require('fs');
var PNG = require('pngjs').PNG;
var im = require('imagemagick');
var uuid = require('node-uuid');

var GrowingPacker = require('./GrowingPacker');

var configParser = require('./config-parser');
var fileHelper = require('./file-helper');
var utilHelper = require('./util-helper');
var ss = require('./stylesheet');
var bgItpreter = require('./bg-interpreter');
var imageHelper = require('./image-helper');


var ignoreNetworkRegexp = /^(https?|ftp):\/\//i;
var ignorePositionRegexp = /right|center|bottom/i;
var imageRegexp = /\(['"]?(.+\.(png|jpg|jpeg))(\?.*?)?['"]?\)/i; // gif取第一帧合入

// TODO： repeat-x会横向扩展合进图片，其余repeat忽略
var ignoreRepeatRegexp = /^(repeat-x|repeat-y|repeat)$/i;


var config;
var sprites = [];
var stylesheets = [];

var collectStyleRules = function (css, callback) {
    var filePath = css.path;
    var styleSheet = css.styleSheet;
    var cssRules = styleSheet.cssRules;

    if (cssRules.length > 0) {
        var result = { length: 0 };

        utilHelper.forEach(
            cssRules,
            function (i, rule, next) {
                var spriteReferenceDirective = {};
                var style = rule.style;

                if (!style || style['background-size']) {
                    // 有可能 `@media`  等中没有 样式， 如： `@media xxx {}`
                    // 跳过有background-size的样式
                    // 因为backgrond-size不能简写在background里面，而且拆分background之后再组装的话
                    // background就变成再background-size后面了，会导致background-size被background覆盖// 
                    return next();
                }

                if (style.background) {
                    // 有 background 就先拆分
                    bgItpreter.split(style);
                }

                // background 定位是 right center bottom 的图片不合并
                if (ignorePositionRegexp.test(style['background-position-x']) ||
                    ignorePositionRegexp.test(style['background-position-y'])) {
                    bgItpreter.merge(style);
                    return next();
                }

                // 显式的使用了平铺的， 也不合并
                // TODO, 单独合并repeat-x和repeat-y的
                if (ignoreRepeatRegexp.test(style['background-repeat']) ||
                    ignoreRepeatRegexp.test(style['background-repeat-x']) ||
                    ignoreRepeatRegexp.test(style['background-repeat-y'])) {
                    bgItpreter.merge(style);
                    return next();
                }

                // 有背景图片, 就抽取并合并
                if (style['background-image'] &&
                    style['background-image'].indexOf(',') == -1 && //忽略掉多背景的属性
                    (imageUrl = getImageUrl(style['background-image']))
                ) {
                    // 遇到写绝对路径的图片就跳过
                    if (ignoreNetworkRegexp.test(imageUrl)) {
                        // 这里直接返回了, 因为一个style里面是不会同时存在两个background-image的
                        return next();
                    }

                    imagePath = path.join(config.input, imageUrl);

                    if (!fs.existsSync(imagePath)) {
                        // 容错： 如果这个图片是不存在的, 就直接返回
                        return next();
                    }

                    ss.getSpriteReferenceDirective(
                        filePath,
                        rule,
                        function (spriteReferenceDirective) {

                            // 把用了同一个文件的样式汇集在一起
                            var uid = uuid.v4();
                            //if (!result[imageUrl]) {
                            result[uid] = {
                                url: imageUrl,
                                sprite: spriteReferenceDirective,
                                cssRules: style
                            };
                            result.length++;

                            next();
                        }
                    );
                }
                else {
                    return next();
                }
            },
            function (count) {
                callback(result);
            }
        );
    }
}

var getImageUrl = function (backgroundImage) {
    var imgs = backgroundImage.match(imageRegexp);
    if (imgs) {
        return imgs[1];
    }
    return null;
}


var updateBackground = function () {

    for (var i = 0; i < stylesheets.length; i++) {
        var stylesheet = stylesheets[i];

        var spriteObjs = stylesheet.spriteObjs;

        for (var j in spriteObjs) {
            var uid = j;
            var spriteObj = spriteObjs[j];

            var spriteInfo = spriteObj.sprite;
            var spriteImageName = spriteInfo['sprite-ref'];

            var sprite = getSprite(spriteImageName);

            var imageInfo = getSpriteImage(sprite, uid);

            replaceAndPositionBackground(
                sprite['sprite-image'],
                spriteObj,
                { x: imageInfo.x, y: imageInfo.y }
            );
        }
    }

};

var positionImages = function (callback) {

    // 填充 sprites 对象中 imgs 字段信息
    for (var i = 0; i < stylesheets.length; i++) {
        var stylesheet = stylesheets[i];

        console.log(stylesheet);

        var spriteObjs = stylesheet.spriteObjs;

        for (var j in spriteObjs) {
            var spriteObj = spriteObjs[j];

            var imageUrl = spriteObj.url;

            var spriteInfo = spriteObj.sprite;
            var spriteName = spriteInfo['sprite-ref'];
            var margins = bgItpreter.getMarginInfo(spriteInfo);
            var align = (spriteInfo['sprite-alignment'] || 'left').trim();

            var imageInfo = spriteObj.imageInfo;

            var spriteImage = getSprite(spriteInfo['sprite-ref']);

            if (!spriteImage.imgs) {
                spriteImage.imgs = [];
            }

            var img = {
                imgName: imageUrl,
                imgUrl: path.resolve(config.input, imageUrl),
                margin: margins,
                align: align,
                width: imageInfo.width,
                height: imageInfo.height,
                uuid: j,
                x: 0,
                y: 0
            };

            spriteImage.imgs.push(img);
        }
    }

    // 每个 sprite 对象中需要被合并的图片排序
    utilHelper.forEach(sprites,
        function (i, sprite, next) {
            var spriteRef = path.resolve(config.output, sprite['sprite-image']);
            var imgs = sprite.imgs;

            if (!imgs.length) {
                next();
            }

            var height = 0;
            var width = 0;

            var defaultMargin = config.margin;

            // sort
            for (var m = 0; m < imgs.length; m++) {
                var img = imgs[m];

                var marginTop = img.margin[0] == 0 ? config.margin[0] : img.margin[0];
                var marginRight = img.margin[1] == 0 ? config.margin[1] : img.margin[1];
                var marginBottom = img.margin[2] == 0 ? config.margin[2] : img.margin[2];
                var marginLeft = img.margin[3] == 0 ? config.margin[3] : img.margin[3];

                var w = img.width + marginRight + marginLeft;
                var h = img.height + marginBottom + marginTop;

                height += h;
                if (width < w) {
                    width = w;
                }
            }

            imgs.sort(function (a, b) {
                return (b.width + b.margin[1] + b.margin[3]) - (a.width + a.margin[1] + a.margin[3]);
            });

            var root = {
                x: 0,
                y: 0
            };

            utilHelper.forEach(
                imgs,
                function (i, img, nextImg) {
                    var margin = [0, 0, 0, 0];

                    margin[0] = img.margin[0] == 0 ? config.margin[0] : img.margin[0];
                    margin[1] = img.margin[1] == 0 ? config.margin[1] : img.margin[1];
                    margin[2] = img.margin[2] == 0 ? config.margin[2] : img.margin[2];
                    margin[3] = img.margin[3] == 0 ? config.margin[3] : img.margin[3];

                    imageHelper.expand(config, img, margin, function () {
                        img.x = root.x + margin[3];
                        img.y = root.y + margin[0];

                        root.y += img.height + margin[0] + margin[2];

                        nextImg();
                    });
                },
                function () {
                    // 生成 sprite 图片
                    console.log('generating：', sprite.__url, '...');

                    var workingdir = config.workingdir
                        || path.resolve((config.imageOutput || config.output), '/tmp/');

                    var montageImages = [];

                    for (var i = 0; i < imgs.length; i++) {
                        montageImages.push(path.resolve(workingdir, imgs[i].uuid + '.png'))
                    }

                    var output = path.resolve(config.output, sprite.__url);

                    imageHelper.montage(montageImages, output);

                    next();
                }
            );
        },
        function () {
            // 此处 callback 主要完成更新 cssom 对象中背景 position 值并回写 css 文件
            // 其实无所谓，不需要与上述操作同步，但是同步了也无所谓～
            callback();
        }
    );

};

var createPng = function (width, height) {
    var png = new PNG({
        width: width,
        height: height/*,
        deflateLevel: 0,
        deflateStrategy: 4*/
    });
    //先把所有元素至空, 防止污染
    for (var y = 0; y < png.height; y++) {
        for (var x = 0; x < png.width; x++) {
            var idx = (png.width * y + x) << 2;

            png.data[idx] = 0;
            png.data[idx + 1] = 0;
            png.data[idx + 2] = 0;

            png.data[idx + 3] = 0;
        }
    }
    return png;
}

var getImageName = function (cssFileName, index, total) {
    // console.log(cssFileName, index, total);
    var name = '';
    if (cssFileName) {
        var basename = path.basename(cssFileName);
        var extname = path.extname(basename);
        name = basename.replace(extname, '');
    }

    if (!name) {
        name = 'all';
    }


    return config.imageOutput + name + '.png';
}

var getSprite = function (spriteName) {
    var sprite;

    for (var i = 0; i < sprites.length; i++) {
        if (sprites[i].sprite == spriteName) {
            sprite = sprites[i];

            break;
        }
    }

    return sprite;
};

var getSpriteImage = function (sprite, uid) {
    var imgs = sprite.imgs;

    var result = null;

    for (var i = 0; i < imgs.length; i++) {
        if (imgs[i].uuid == uid) {
            result = imgs[i];
            break;
        }
    }

    return result;
};

var replaceAndPositionBackground = function (imageUrl, styleObj, place) {

    var cssRules = styleObj.cssRules;

    if (cssRules['background-image']) {
        cssRules['background-image'] = imageUrl;

        setPxValue(cssRules, 'background-position-x', place.x);
        setPxValue(cssRules, 'background-position-y', place.y);

        bgItpreter.merge(cssRules);
    }
}

/**
 * 调整 样式规则的像素值, 如果原来就有值, 则在原来的基础上变更
 */
var setPxValue = function (rule, attr, newValue) {
    var value;
    if (rule[attr]) {
        value = parseInt(rule[attr]);
    } else {
        value = 0;
        rule[rule.length++] = attr;
    }
    value = value - newValue;
    value = value ? value + 'px' : '0';
    rule[attr] = value;
}

/**
 * 往全局sprites对象内添加sprite
 */
var addSpriteDefinitions = function (newDefs) {
    debugger

    for (var i = 0; i < newDefs.length; i++) {
        var newSpriteDef = newDefs[i];

        var spriteRef = newSpriteDef['sprite'];

        var isNewSpriteDef = true;

        for (var j = 0; j < sprites.length; j++) {
            if (sprites[j]['sprite'] == spriteRef) {
                isNewSpriteDef = false;

                // TODO: warning report, duplicate sprite definition found!
                // override the old one, onece a new one(duplicate) is found
                sprites[j] = newSpriteDef;
            }
        }

        if (isNewSpriteDef) {
            sprites.push(newSpriteDef);
        }
    }
};


/*
 * 收集 sprite 定义信息，填充 sprites 全局变量
 */
var collectSpriteDefinitions = function (fileList, callback) {
    var input = config.input;

    utilHelper.forEach(
        fileList,
        function (i, fileName, next) {
            var filePath = path.join(input, fileName)

            ss.getSpriteDefinitions(filePath, function (newSpriteDefinitions) {
                // 添加当前css文件内新产生的sprite definition(s)
                addSpriteDefinitions(newSpriteDefinitions);

                next();
            });
        },
        function () {
            callback();
        }
    );
};


exports.run = function (options) {

    config = configParser.parse(options);

    var input = config.input;
    var output = config.output;
    var imageOutput = config.imageOutput;

    var fileList = fileHelper.listFilesSync(input, 'css');

    if (!fileList.length) {
        console.log('there is no file in ' + config.input);
        return;
    }

    var cssObjects = [];
    var spriteImages = [];
    var combinedStyleObjList = { length: 0 };


    collectSpriteDefinitions(fileList, processSprite);


    function processSprite() {
        utilHelper.forEach(
                fileList,
                function (i, fileName, next) {
                    var css = {
                        fileName: fileName
                    };

                    var filePath = path.join(input, fileName)

                    css.styleSheet = ss.getStyleSheet(filePath);
                    css.cssRules = ss.getCssRules(filePath);
                    css.path = filePath;

                    var content = ss.read(filePath);

                    collectStyleRules(css, function (styleObjList) {
                        if (!styleObjList.length) {
                            return next();
                        }

                        delete styleObjList.length;

                        // 处理此css文件内包含的图片
                        imageHelper.read(config, styleObjList, function (result) {
                            delete result.length;

                            /**
                             * {
                             *     path: 'test\css\base.css',
                             *     data: { image-path: {cssRules, w, h, imageInfo, url, sprint} }
                             * }
                             */
                            stylesheets.push({
                                'fileInfo': { 'path': filePath, 'name': fileName },
                                'css': css,
                                'spriteObjs': result
                            });

                            next();
                        });
                    });


                },
                function () {
                    // 处理完所有css文件
                    // 得到 sprits 和 stylesheets 2个数组
                    // sprites: css 文件中定义的 sprite 信息
                    // stylesheets: css 文件和 此 css 文件中需要做合并的图片信息

                    // 给每个 sprite 对象计算好宽高等
                    positionImages(function () {
                        // 更新 css 对象
                        updateBackground();

                        // 回写 css 文件
                        for (var i = 0; i < stylesheets.length; i++) {
                            var stylesheet = stylesheets[i];

                            ss.write(stylesheet.css, output);
                        }
                    });
                }
            );
    }



}

exports.run('./test/config.json');