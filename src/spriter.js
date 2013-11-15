/*
    @name: hm-sprite
    @description: implemention of http://csssprites.org/
*/

var path = require('path');
var fs = require('fs');
var PNG = require('pngjs').PNG;

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

                            console.log('--------------------')
                            //console.log(spriteReferenceDirective)
                            console.log('--------------------')

                            // 把用了同一个文件的样式汇集在一起
                            //if (!result[imageUrl]) {
                            result[imageUrl] = {
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

var positionImages = function (styleObjList) {
    var styleObjArr = [],
        arr = [],
        existArr = [],
        styleObj,
        //maxSize = 0,
        packer = new GrowingPacker();

    // 把已经合并了并已输出的图片先排除掉
    for (var i in styleObjList) {
        styleObj = styleObjList[i];

        if (styleObj.imageInfo.hasDrew) {
            existArr.push(styleObj);
        } else {
            arr.push(styleObj);
        }
    }

    styleObjArr.push(arr);

    //packer 算法需要把最大的一个放在首位...
    //排序算法会对结果造成比较大的影响
    for (var j = 0; arr = styleObjArr[j]; j++) {
        arr.sort(function (a, b) {
            return b.w * b.h - a.w * a.h;
        });
        //packer 定位
        packer.fit(arr);
        arr.root = packer.root;
    }
    if (existArr.length) {
        styleObjArr.push(existArr);
    }

    return styleObjArr;
}

var drawImageAndPositionBackground = function (styleObjArr, cssFileName) {
    var imageInfo;
    var length = styleObjArr.length;

    if (!styleObjArr[length - 1].root) {
        // 若最后一个元素, 没有root 属性, 表示它的样式都是复用已合并的图片的, 直接替换样式即可
        var arr = styleObjArr.pop();
        length = styleObjArr.length;

        for (var j = 0, styleObj; styleObj = arr[j]; j++) {
            imageInfo = styleObj.imageInfo;
            styleObj.fit = imageInfo.fit;
            replaceAndPositionBackground(imageInfo.imageName, styleObj);
        }
    }

    debugger

    utilHelper.forEach(styleObjArr, function (i, arr, next) {
        console.log(i);
        console.log('-------------------------------');

        var imageResult = createPng(arr.root.w, arr.root.h);

        var imageName = '';
        var imageUrl = '';

        utilHelper.forEach(arr, function (j, styleObj, goon) {
            var imageInfo = styleObj.imageInfo;

            // 容错处理
            if (!styleObj.sprite) { return goon(); }

            imageName = styleObj.sprite['sprite-ref'];

            if (imageName != undefined && imageName != '') {
                imageUrl = getSpriteImageUrl(imageName);

                console.log(cssFileName, ": ", styleObj.url)

                replaceAndPositionBackground(imageUrl, styleObj);

                imageInfo.fit = styleObj.fit;
                imageInfo.hasDrew = true;
                imageInfo.imageName = imageName;

                debugger

                var image = imageInfo.image;
                //对图片进行定位和填充
                image.bitblt(imageResult, 0, 0, image.width, image.height,
                    imageInfo.fit.x, imageInfo.fit.y);
                goon();
            }
        }, function (count) {
            //没必要输出一张空白图片
            debugger;

            if (count > 0) {
                var spriteOutImage = '';
                var imageUrlInfo;

                imageUrlInfo = imageUrl.split('"');
                if (imageUrlInfo.length == 3) {
                    spriteOutImage = imageUrlInfo[1];
                }
                else {
                    imageUrlInfo = imageUrl.split("'");

                    if (imageUrlInfo.length == 3) {
                        spriteOutImage = imageUrlInfo[1];
                    }
                    else {
                        // sprite定义名称不正确，直接返回不做处理
                        return next();
                    }
                }

                spriteOutImage = path.join(config.imageOutput, spriteOutImage);

                console.log(spriteOutImage);

                fileHelper.mkdirsSync(path.dirname(spriteOutImage));

                imageResult.pack().pipe(fs.createWriteStream(spriteOutImage));
                console.log('>>output image:', spriteOutImage);
            }
            next();
        });
    });

}

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

var getSpriteImageUrl = function (spriteName) {
    var imageUrl;
    for (var i = 0; i < sprites.length; i++) {
        if (sprites[i].sprite == spriteName) {
            imageUrl = sprites[i]['sprite-image'];
        }
    }

    return imageUrl;
}

var replaceAndPositionBackground = function (imageUrl, styleObj) {

    var cssRules = styleObj.cssRules;

    if (cssRules['background-image']) {
        cssRules['background-image'] = imageUrl;

        setPxValue(cssRules, 'background-position-x', styleObj.fit.x);
        setPxValue(cssRules, 'background-position-y', styleObj.fit.y);

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

            // 获取是否新增sprite-image
            ss.getSpriteDefinitions(filePath, function (newSpriteDefinitions) {

                // 添加当前css文件内新产生的sprite definition(s)
                addSpriteDefinitions(newSpriteDefinitions);

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
                            'path': filePath,
                            'data': result
                        });

                        //var styleObjArr = positionImages(result);

                        //输出合并的图片 并修改样式表里面的background
                        //drawImageAndPositionBackground(styleObjArr, fileName);

                        //输出修改后的样式表
                        //ss.write(css, output);
                        next();
                    });
                });
            });


        },
        function () {
            // 处理完所有css文件
            // 得到 sprits 和 stylesheets 2个数组
            // sprites: css 文件中定义的 sprite 信息
            // stylesheets: css 文件和 此 css 文件中需要做合并的图片信息

            // 处理 stylesheets 数组中每个 css 文件
            for (var i = 0; i < stylesheets.length; i++) {
                var stylesheet = stylesheets[i];

                var path = stylesheet.path;
                var data = stylesheet.data;


            }

            //console.log('fuck: ', sprites);
        }
    );

}

exports.run('./test/config.json');