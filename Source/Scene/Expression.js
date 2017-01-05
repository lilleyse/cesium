/*global define*/
define([
        '../Core/Cartesian2',
        '../Core/Cartesian3',
        '../Core/Cartesian4',
        '../Core/Color',
        '../Core/defined',
        '../Core/defineProperties',
        '../Core/DeveloperError',
        '../Core/isArray',
        '../Core/Math',
        '../ThirdParty/jsep',
        './ExpressionNodeType'
    ], function(
        Cartesian2,
        Cartesian3,
        Cartesian4,
        Color,
        defined,
        defineProperties,
        DeveloperError,
        isArray,
        CesiumMath,
        jsep,
        ExpressionNodeType) {
    "use strict";

    var unaryOperators = ['!', '-', '+'];
    var binaryOperators = ['+', '-', '*', '/', '%', '===', '==', '!==', '!=', '>', '>=', '<', '<=', '&&', '||', '!~', '=~'];

    var variableRegex = /\${(.*?)}/g;
    var backslashRegex = /\\/g;
    var backslashReplacement = '@#%';
    var replacementRegex = /@#%/g;

    var scratchColor = new Color();

    var ScratchStorage = {
        scratchColorIndex : 0,
        scratchColorArray : [new Color()],
        scratchCartesian2Index : 0,
        scratchCartesian3Index : 0,
        scratchCartesian4Index : 0,
        scratchCartesian2Array : [new Cartesian2()],
        scratchCartesian3Array : [new Cartesian3()],
        scratchCartesian4Array : [new Cartesian4()],
        reset : function() {
            this.scratchColorIndex = 0;
            this.scratchCartesian2Index = 0;
            this.scratchCartesian3Index = 0;
            this.scratchCartesian4Index = 0;
        },
        getColor : function() {
            if (this.scratchColorIndex >= this.scratchColorArray.length) {
                this.scratchColorArray.push(new Color());
            }
            return this.scratchColorArray[this.scratchColorIndex++];
        },
        getCartesian2 : function() {
            if (this.scratchCartesian2Index >= this.scratchCartesian2Array.length) {
                this.scratchCartesian2Array.push(new Cartesian2());
            }
            return this.scratchCartesian2Array[this.scratchCartesian2Index++];
        },
        getCartesian3 : function() {
            if (this.scratchCartesian3Index >= this.scratchCartesian3Array.length) {
                this.scratchCartesian3Array.push(new Cartesian3());
            }
            return this.scratchCartesian3Array[this.scratchCartesian3Index++];
        },
        getCartesian4 : function() {
            if (this.scratchCartesian4Index >= this.scratchCartesian4Array.length) {
                this.scratchCartesian4Array.push(new Cartesian4());
            }
            return this.scratchCartesian4Array[this.scratchCartesian4Index++];
        }
    };

    var binaryFunctions = {
        atan2 : Math.atan2,
        pow : Math.pow,
        min : Math.min,
        max : Math.max
    };

    var unaryFunctions = {
        abs : Math.abs,
        sqrt : Math.sqrt,
        cos : Math.cos,
        sin : Math.sin,
        tan : Math.tan,
        acos : Math.acos,
        asin : Math.asin,
        atan : Math.atan,
        radians : CesiumMath.toRadians,
        degrees : CesiumMath.toDegrees
    };

    var ternaryFunctions = {
        clamp : CesiumMath.clamp,
        mix : CesiumMath.lerp
    };

    /**
     * Evaluates an expression defined using the
     * {@link https://github.com/AnalyticalGraphicsInc/3d-tiles/tree/master/Styling|3D Tiles Styling language}.
     * <p>
     * Implements the {@link StyleExpression} interface.
     * </p>
     *
     * @alias Expression
     * @constructor
     *
     * @param {String} [expression] The expression defined using the 3D Tiles Styling language.
     *
     * @example
     * var expression = new Cesium.Expression('(regExp("^Chest").test(${County})) && (${YearBuilt} >= 1970)');
     * expression.evaluate(frameState, feature); // returns true or false depending on the feature's properties
     *
     * @example
     * var expression = new Cesium.Expression('(${Temperature} > 90) ? color("red") : color("white")');
     * expression.evaluateColor(frameState, feature, result); // returns a Cesium.Color object
     *
     * @see {@link https://github.com/AnalyticalGraphicsInc/3d-tiles/tree/master/Styling|3D Tiles Styling language}
     */
    function Expression(expression) {
        //>>includeStart('debug', pragmas.debug);
        if (typeof(expression) !== 'string') {
            throw new DeveloperError('expression must be a string.');
        }
        //>>includeEnd('debug');

        this._expression = expression;
        expression = replaceVariables(removeBackslashes(expression));

        // customize jsep operators
        jsep.addBinaryOp('=~', 0);
        jsep.addBinaryOp('!~', 0);

        var ast;
        try {
            ast = jsep(expression);
        } catch (e) {
            //>>includeStart('debug', pragmas.debug);
            throw new DeveloperError(e);
            //>>includeEnd('debug');
        }

        this._runtimeAst = createRuntimeAst(this, ast);
    }

    defineProperties(Expression.prototype, {
        /**
         * Gets the expression defined in the 3D Tiles Styling language.
         *
         * @memberof Expression.prototype
         *
         * @type {String}
         * @readonly
         *
         * @default undefined
         */
        expression : {
            get : function() {
                return this._expression;
            }
        }
    });

    /**
     * Evaluates the result of an expression, optionally using the provided feature's properties. If the result of
     * the expression in the
     * {@link https://github.com/AnalyticalGraphicsInc/3d-tiles/tree/master/Styling|3D Tiles Styling language}
     * is of type <code>Boolean</code>, <code>Number</code>, or <code>String</code>, the corresponding JavaScript
     * primitive type will be returned. If the result is a <code>RegExp</code>, a Javascript <code>RegExp</code>
     * object will be returned. If the result is a <code>Color</code>, a {@link Color} object will be returned.
     * If the result is a <code>Cartesian2</code>, <code>Cartesian3</code>, or <code>Cartesian4</code>,
     * a {@link Cartesian2}, {@link Cartesian3}, or {@link Cartesian4} object will be returned.
     *
     * @param {FrameState} frameState The frame state.
     * @param {Cesium3DTileFeature} feature The feature who's properties may be used as variables in the expression.
     * @returns {Boolean|Number|String|Color|Cartesian2|Cartesian3|Cartesian4|RegExp} The result of evaluating the expression.
     */
    Expression.prototype.evaluate = function(frameState, feature) {
        ScratchStorage.reset();
        var result = this._runtimeAst.evaluate(frameState, feature);
        if ((result instanceof Color) || (result instanceof Cartesian2) || (result instanceof Cartesian3) || (result instanceof Cartesian4)) {
            return result.clone();
        }
        return result;
    };

    /**
     * Evaluates the result of a Color expression, using the values defined by a feature.
     *
     * @param {FrameState} frameState The frame state.
     * @param {Cesium3DTileFeature} feature The feature who's properties may be used as variables in the expression.
     * @param {Color} [result] The object in which to store the result
     * @returns {Color} The modified result parameter or a new Color instance if one was not provided.
     */
    Expression.prototype.evaluateColor = function(frameState, feature, result) {
        ScratchStorage.reset();
        var color = this._runtimeAst.evaluate(frameState, feature);
        return Color.clone(color, result);
    };

    /**
     * Gets the shader function for this expression.
     * Returns undefined if the shader function can't be generated from this expression.
     *
     * @param {String} functionName Name to give to the generated function.
     * @param {String} attributePrefix Prefix that is added to any variable names to access vertex attributes.
     * @param {Object} shaderState Stores information about the generated shader function, including whether it is translucent.
     * @param {String} returnType The return type of the generated function.
     *
     * @returns {String} The shader function.
     *
     * @private
     */
    Expression.prototype.getShaderFunction = function(functionName, attributePrefix, shaderState, returnType) {
        var shaderExpression = this.getShaderExpression(attributePrefix, shaderState);
        if (!defined(shaderExpression)) {
            return undefined;
        }

        shaderExpression = returnType + ' ' + functionName + '() \n' +
            '{ \n' +
            '    return ' + shaderExpression + '; \n' +
            '} \n';

        return shaderExpression;
    };

    /**
     * Gets the shader expression for this expression.
     * Returns undefined if the shader expression can't be generated from this expression.
     *
     * @param {String} attributePrefix Prefix that is added to any variable names to access vertex attributes.
     * @param {Object} shaderState Stores information about the generated shader function, including whether it is translucent.
     *
     * @returns {String} The shader expression.
     *
     * @private
     */
    Expression.prototype.getShaderExpression = function(attributePrefix, shaderState) {
        return this._runtimeAst.getShaderExpression(attributePrefix, shaderState);
    };

    function Node(type, value, left, right, test) {
        this._type = type;
        this._value = value;
        this._left = left;
        this._right = right;
        this._test = test;
        this.evaluate = undefined;

        setEvaluateFunction(this);
    }

    function removeBackslashes(expression) {
        return expression.replace(backslashRegex, backslashReplacement);
    }

    function replaceBackslashes(expression) {
        return expression.replace(replacementRegex, '\\');
    }

    function replaceVariables(expression) {
        var exp = expression;
        var result = '';
        var i = exp.indexOf('${');
        while (i >= 0) {
            // check if string is inside quotes
            var openSingleQuote = exp.indexOf('\'');
            var openDoubleQuote = exp.indexOf('"');
            var closeQuote;
            if (openSingleQuote >= 0 && openSingleQuote < i) {
                closeQuote = exp.indexOf('\'', openSingleQuote + 1);
                result += exp.substr(0, closeQuote + 1);
                exp = exp.substr(closeQuote + 1);
                i = exp.indexOf('${');
            } else if (openDoubleQuote >= 0 && openDoubleQuote < i) {
                closeQuote = exp.indexOf('"', openDoubleQuote + 1);
                result += exp.substr(0, closeQuote + 1);
                exp = exp.substr(closeQuote + 1);
                i = exp.indexOf('${');
            } else {
                result += exp.substr(0, i);
                var j = exp.indexOf('}');
                //>>includeStart('debug', pragmas.debug);
                if (j < 0) {
                    throw new DeveloperError('Error: unmatched {.');
                }
                //>>includeEnd('debug');
                result += "czm_" + exp.substr(i + 2, j - (i + 2));
                exp = exp.substr(j + 1);
                i = exp.indexOf('${');
            }
        }
        result += exp;
        return result;
    }

    function parseLiteral(ast) {
        var type = typeof(ast.value);
        if (ast.value === null) {
            return new Node(ExpressionNodeType.LITERAL_NULL, null);
        } else if (type === 'boolean') {
            return new Node(ExpressionNodeType.LITERAL_BOOLEAN, ast.value);
        } else if (type === 'number') {
            return new Node(ExpressionNodeType.LITERAL_NUMBER, ast.value);
        } else if (type === 'string') {
            if (ast.value.indexOf('${') >= 0) {
                return new Node(ExpressionNodeType.VARIABLE_IN_STRING, ast.value);
            }
            return new Node(ExpressionNodeType.LITERAL_STRING, replaceBackslashes(ast.value));
        }
    }

    function parseCall(expression, ast) {
        var args = ast.arguments;
        var argsLength = args.length;
        var call;
        var val, left, right;

        // Member function calls
        if (ast.callee.type === 'MemberExpression') {
            call = ast.callee.property.name;
            var object = ast.callee.object;
            if (call === 'test' || call === 'exec') {
                // Make sure this is called on a valid type
                //>>includeStart('debug', pragmas.debug);
                if (object.callee.name !== 'regExp') {
                    throw new DeveloperError('Error: ' + call + ' is not a function.');
                }
                //>>includeEnd('debug');
                if (argsLength === 0) {
                    if (call === 'test') {
                        return new Node(ExpressionNodeType.LITERAL_BOOLEAN, false);
                    } else {
                        return new Node(ExpressionNodeType.LITERAL_NULL, null);
                    }
                }
                left = createRuntimeAst(expression, object);
                right = createRuntimeAst(expression, args[0]);
                return new Node(ExpressionNodeType.FUNCTION_CALL, call, left, right);
            } else if (call === 'toString') {
                val = createRuntimeAst(expression, object);
                return new Node(ExpressionNodeType.FUNCTION_CALL, call, val);
            }

            //>>includeStart('debug', pragmas.debug);
            throw new DeveloperError('Error: Unexpected function call "' + call + '".');
            //>>includeEnd('debug');
        }

        // Non-member function calls
        call = ast.callee.name;
        if (call === 'color') {
            if (argsLength === 0) {
                return new Node(ExpressionNodeType.LITERAL_COLOR, call);
            }
            val = createRuntimeAst(expression, args[0]);
            if (defined(args[1])) {
                var alpha = createRuntimeAst(expression, args[1]);
                return new Node(ExpressionNodeType.LITERAL_COLOR, call, [val, alpha]);
            }
            return new Node(ExpressionNodeType.LITERAL_COLOR, call, [val]);
        } else if (call === 'rgb' || call === 'hsl') {
            //>>includeStart('debug', pragmas.debug);
            if (argsLength < 3) {
                throw new DeveloperError('Error: ' + call + ' requires three arguments.');
            }
            //>>includeEnd('debug');
            val = [
                createRuntimeAst(expression, args[0]),
                createRuntimeAst(expression, args[1]),
                createRuntimeAst(expression, args[2])
            ];
           return new Node(ExpressionNodeType.LITERAL_COLOR, call, val);
        } else if (call === 'rgba' || call === 'hsla') {
            //>>includeStart('debug', pragmas.debug);
            if (argsLength < 4) {
                throw new DeveloperError('Error: ' + call + ' requires four arguments.');
            }
            //>>includeEnd('debug');
            val = [
                createRuntimeAst(expression, args[0]),
                createRuntimeAst(expression, args[1]),
                createRuntimeAst(expression, args[2]),
                createRuntimeAst(expression, args[3])
            ];
            return new Node(ExpressionNodeType.LITERAL_COLOR, call, val);
        } else if (call === 'vec2' || call === 'vec3' || call === 'vec4') {
            //>>includeStart('debug', pragmas.debug);
            var vectorLength = parseInt(call.charAt(3));
            if (argsLength === 0 || argsLength > vectorLength) {
                // Check that the call has a valid number of arguments. Other checks can only occur at evaluation time.
                throw new DeveloperError('Error: invalid number of arguments (' + argsLength + ') for' + call);
            }
            //>>includeEnd('debug', pragmas.debug);
            val = new Array(argsLength);
            for (var i = 0; i < argsLength; ++i) {
                val[i] = createRuntimeAst(expression, args[i]);
            }
            return new Node(ExpressionNodeType.LITERAL_VECTOR, call, val);
        } else if (call === 'isNaN' || call === 'isFinite') {
            if (argsLength === 0) {
                if (call === 'isNaN') {
                    return new Node(ExpressionNodeType.LITERAL_BOOLEAN, true);
                } else {
                    return new Node(ExpressionNodeType.LITERAL_BOOLEAN, false);
                }
            }
            val = createRuntimeAst(expression, args[0]);
            return new Node(ExpressionNodeType.UNARY, call, val);
        } else if (call === 'isExactClass' || call === 'isClass') {
            //>>includeStart('debug', pragmas.debug);
            if (argsLength < 1 || argsLength > 1) {
                throw new DeveloperError('Error: ' + call + ' requires exactly one argument.');
            }
            //>>includeEnd('debug');
            val = createRuntimeAst(expression, args[0]);
            return new Node(ExpressionNodeType.UNARY, call, val);
        } else if (call === 'getExactClassName') {
            //>>includeStart('debug', pragmas.debug);
            if (argsLength > 0) {
                throw new DeveloperError('Error: ' + call + ' does not take any argument.');
            }
            //>>includeEnd('debug');
            return new Node(ExpressionNodeType.UNARY, call);
        } else if (defined(unaryFunctions[call])) {
            //>>includeStart('debug', pragmas.debug);
            if (argsLength !== 1) {
                throw new DeveloperError('Error: ' + call + ' requires exactly one argument.');
            }
            //>>includeEnd('debug');
            val = createRuntimeAst(expression, args[0]);
            return new Node(ExpressionNodeType.UNARY, call, val);
        } else if (defined(binaryFunctions[call])) {
            //>>includeStart('debug', pragmas.debug);
            if (argsLength !== 2) {
                throw new DeveloperError('Error: ' + call + ' requires exactly two arguments.');
            }
            //>>includeEnd('debug');
            left = createRuntimeAst(expression, args[0]);
            right = createRuntimeAst(expression, args[1]);
            return new Node(ExpressionNodeType.BINARY, call, left, right);
        } else if (defined(ternaryFunctions[call])) {
            //>>includeStart('debug', pragmas.debug);
            if (argsLength !== 3) {
                throw new DeveloperError('Error: ' + call + ' requires exactly three arguments.');
            }
            //>>includeEnd('debug');
            left = createRuntimeAst(expression, args[0]);
            right = createRuntimeAst(expression, args[1]);
            var test = createRuntimeAst(expression, args[2]);
            return new Node(ExpressionNodeType.TERNARY, call, left, right, test);
        } else if (call === 'Boolean') {
            if (argsLength === 0) {
                return new Node(ExpressionNodeType.LITERAL_BOOLEAN, false);
            }
            val = createRuntimeAst(expression, args[0]);
            return new Node(ExpressionNodeType.UNARY, call, val);
        } else if (call === 'Number') {
            if (argsLength === 0) {
                return new Node(ExpressionNodeType.LITERAL_NUMBER, 0);
            }
            val = createRuntimeAst(expression, args[0]);
            return new Node(ExpressionNodeType.UNARY, call, val);
        } else if (call === 'String') {
            if (argsLength === 0) {
                return new Node(ExpressionNodeType.LITERAL_STRING, '');
            }
            val = createRuntimeAst(expression, args[0]);
            return new Node(ExpressionNodeType.UNARY, call, val);
        } else if (call === 'regExp') {
            return parseRegex(expression, ast);
        }

        //>>includeStart('debug', pragmas.debug);
        throw new DeveloperError('Error: Unexpected function call "' + call + '".');
        //>>includeEnd('debug');
    }

    function parseRegex(expression, ast) {
        var args = ast.arguments;
        // no arguments, return default regex
        if (args.length === 0) {
            return new Node(ExpressionNodeType.LITERAL_REGEX, new RegExp());
        }

        var pattern = createRuntimeAst(expression, args[0]);
        var exp;

        // optional flag argument supplied
        if (args.length > 1) {
            var flags = createRuntimeAst(expression, args[1]);
            if (isLiteralType(pattern) && isLiteralType(flags)) {
                try {
                    exp = new RegExp(replaceBackslashes(String(pattern._value)), flags._value);
                } catch (e) {
                    //>>includeStart('debug', pragmas.debug);
                    throw new DeveloperError(e);
                    //>>includeEnd('debug');
                }
                return new Node(ExpressionNodeType.LITERAL_REGEX, exp);
            }
            return new Node(ExpressionNodeType.REGEX, pattern, flags);
        }

        // only pattern argument supplied
        if (isLiteralType(pattern)) {
            try {
                exp = new RegExp(replaceBackslashes(String(pattern._value)));
            } catch (e) {
                //>>includeStart('debug', pragmas.debug);
                throw new DeveloperError(e);
                //>>includeEnd('debug');
            }
            return new Node(ExpressionNodeType.LITERAL_REGEX, exp);
        }
        return new Node(ExpressionNodeType.REGEX, pattern);
    }

    function parseKeywordsAndVariables(ast) {
        if (isVariable(ast.name)) {
            return new Node(ExpressionNodeType.VARIABLE, getPropertyName(ast.name));
        } else if (ast.name === 'NaN') {
            return new Node(ExpressionNodeType.LITERAL_NUMBER, NaN);
        } else if (ast.name === 'Infinity') {
            return new Node(ExpressionNodeType.LITERAL_NUMBER, Infinity);
        } else if (ast.name === 'undefined') {
            return new Node(ExpressionNodeType.LITERAL_UNDEFINED, undefined);
        } else if (ast.name === 'PI') {
            return new Node(ExpressionNodeType.LITERAL_NUMBER, Math.PI);
        } else if (ast.name === 'E') {
            return new Node(ExpressionNodeType.LITERAL_NUMBER, Math.E);
        } else if (ast.name === 'TILES3D_TILESET_TIME') {
            return new Node(ExpressionNodeType.LITERAL_GLOBAL, ast.name);
        }

        //>>includeStart('debug', pragmas.debug);
        throw new DeveloperError('Error: ' + ast.name + ' is not defined.');
        //>>includeEnd('debug');
    }

    function parseMemberExpression(expression, ast) {
        var val;
        var obj = createRuntimeAst(expression, ast.object);
        if (ast.computed) {
            val = createRuntimeAst(expression, ast.property);
            return new Node(ExpressionNodeType.MEMBER, 'brackets', obj, val);
        } else {
            val = new Node(ExpressionNodeType.LITERAL_STRING, ast.property.name);
            return new Node(ExpressionNodeType.MEMBER, 'dot', obj, val);
        }
    }

    function isLiteralType(node) {
        return (node._type >= ExpressionNodeType.LITERAL_NULL);
    }

    function isVariable(name) {
        return (name.substr(0, 4) === 'czm_');
    }

    function getPropertyName(variable) {
        return variable.substr(4);
    }

    function createRuntimeAst(expression, ast) {
        var node;
        var op;
        var left;
        var right;

        if (ast.type === 'Literal') {
            node = parseLiteral(ast);
        } else if (ast.type === 'CallExpression') {
            node = parseCall(expression, ast);
        } else if (ast.type === 'Identifier') {
            node = parseKeywordsAndVariables(ast);
        } else if (ast.type === 'UnaryExpression') {
            op = ast.operator;
            var child = createRuntimeAst(expression, ast.argument);
            if (unaryOperators.indexOf(op) > -1) {
                node = new Node(ExpressionNodeType.UNARY, op, child);
            } else {
                //>>includeStart('debug', pragmas.debug);
                throw new DeveloperError('Error: Unexpected operator "' + op + '".');
                //>>includeEnd('debug');
            }
        } else if (ast.type === 'BinaryExpression') {
            op = ast.operator;
            left = createRuntimeAst(expression, ast.left);
            right = createRuntimeAst(expression, ast.right);
            if (binaryOperators.indexOf(op) > -1) {
                node = new Node(ExpressionNodeType.BINARY, op, left, right);
            } else {
                //>>includeStart('debug', pragmas.debug);
                throw new DeveloperError('Error: Unexpected operator "' + op + '".');
                //>>includeEnd('debug');
            }
        } else if (ast.type === 'LogicalExpression') {
            op = ast.operator;
            left = createRuntimeAst(expression, ast.left);
            right = createRuntimeAst(expression, ast.right);
            if (binaryOperators.indexOf(op) > -1) {
                node = new Node(ExpressionNodeType.BINARY, op, left, right);
            }
        } else if (ast.type === 'ConditionalExpression') {
            var test = createRuntimeAst(expression, ast.test);
            left = createRuntimeAst(expression, ast.consequent);
            right = createRuntimeAst(expression, ast.alternate);
            node = new Node(ExpressionNodeType.CONDITIONAL, '?', left, right, test);
        } else if (ast.type === 'MemberExpression') {
            node = parseMemberExpression(expression, ast);
        } else if (ast.type === 'ArrayExpression') {
            var val = [];
            for (var i = 0; i < ast.elements.length; i++) {
                val[i] = createRuntimeAst(expression, ast.elements[i]);
            }
            node = new Node(ExpressionNodeType.ARRAY, val);
        }
        //>>includeStart('debug', pragmas.debug);
        else if (ast.type === 'Compound') {
            // empty expression or multiple expressions
            throw new DeveloperError('Error: Provide exactly one expression.');
        }  else {
            throw new DeveloperError('Error: Cannot parse expression.');
        }
        //>>includeEnd('debug');

        return node;
    }

    function setEvaluateFunction(node) {
        if (node._type === ExpressionNodeType.CONDITIONAL) {
            node.evaluate = node._evaluateConditional;
        } else if (node._type === ExpressionNodeType.FUNCTION_CALL) {
            if (node._value === 'test') {
                node.evaluate = node._evaluateRegExpTest;
            } else if (node._value === 'exec') {
                node.evaluate = node._evaluateRegExpExec;
            } else if (node._value === 'toString') {
                node.evaluate = node._evaluateToString;
            }
        } else if (node._type === ExpressionNodeType.UNARY) {
            if (node._value === '!') {
                node.evaluate = node._evaluateNot;
            } else if (node._value === '-') {
                node.evaluate = node._evaluateNegative;
            } else if (node._value === '+') {
                node.evaluate = node._evaluatePositive;
            } else if (node._value === 'isNaN') {
                node.evaluate = node._evaluateNaN;
            } else if (node._value === 'isFinite') {
                node.evaluate = node._evaluateIsFinite;
            } else if (node._value === 'isExactClass') {
                node.evaluate = node._evaluateIsExactClass;
            } else if (node._value === 'isClass') {
                node.evaluate = node._evaluateIsClass;
            } else if (node._value === 'getExactClassName') {
                node.evaluate = node._evaluategetExactClassName;
            } else if (node._value === 'Boolean') {
                node.evaluate = node._evaluateBooleanConversion;
            } else if (node._value === 'Number') {
                node.evaluate = node._evaluateNumberConversion;
            } else if (node._value === 'String') {
                node.evaluate = node._evaluateStringConversion;
            } else if (defined(unaryFunctions[node._value])) {
                node.evaluate = getEvaluateUnaryFunction(node._value);
            }
        } else if (node._type === ExpressionNodeType.BINARY) {
            if (node._value === '+') {
                node.evaluate = node._evaluatePlus;
            } else if (node._value === '-') {
                node.evaluate = node._evaluateMinus;
            } else if (node._value === '*') {
                node.evaluate = node._evaluateTimes;
            } else if (node._value === '/') {
                node.evaluate = node._evaluateDivide;
            } else if (node._value === '%') {
                node.evaluate = node._evaluateMod;
            } else if (node._value === '===') {
                node.evaluate = node._evaluateEqualsStrict;
            } else if (node._value === '==') {
                node.evaluate = node._evaluateEquals;
            } else if (node._value === '!==') {
                node.evaluate = node._evaluateNotEqualsStrict;
            } else if (node._value === '!=') {
                node.evaluate = node._evaluateNotEquals;
            } else if (node._value === '<') {
                node.evaluate = node._evaluateLessThan;
            } else if (node._value === '<=') {
                node.evaluate = node._evaluateLessThanOrEquals;
            } else if (node._value === '>') {
                node.evaluate = node._evaluateGreaterThan;
            } else if (node._value === '>=') {
                node.evaluate = node._evaluateGreaterThanOrEquals;
            } else if (node._value === '&&') {
                node.evaluate = node._evaluateAnd;
            } else if (node._value === '||') {
                node.evaluate = node._evaluateOr;
            } else if (node._value === '=~') {
                node.evaluate = node._evaluateRegExpMatch;
            } else if (node._value === '!~') {
                node.evaluate = node._evaluateRegExpNotMatch;
            } else if (defined(binaryFunctions[node._value])) {
                node.evaluate = getEvaluateBinaryFunction(node._value);
            }
        } else if (node._type === ExpressionNodeType.TERNARY) {
            node.evaluate = getEvaluateTernaryFunction(node._value);
        } else if (node._type === ExpressionNodeType.MEMBER) {
            if (node._value === 'brackets') {
                node.evaluate = node._evaluateMemberBrackets;
            } else {
                node.evaluate = node._evaluateMemberDot;
            }
        } else if (node._type === ExpressionNodeType.ARRAY) {
            node.evaluate = node._evaluateArray;
        } else if (node._type === ExpressionNodeType.VARIABLE) {
            node.evaluate = node._evaluateVariable;
        } else if (node._type === ExpressionNodeType.VARIABLE_IN_STRING) {
            node.evaluate = node._evaluateVariableString;
        } else if (node._type === ExpressionNodeType.LITERAL_COLOR) {
            node.evaluate = node._evaluateLiteralColor;
        } else if (node._type === ExpressionNodeType.LITERAL_VECTOR) {
            node.evaluate = node._evaluateLiteralVector;
        } else if (node._type === ExpressionNodeType.LITERAL_STRING) {
            node.evaluate = node._evaluateLiteralString;
        } else if (node._type === ExpressionNodeType.REGEX) {
            node.evaluate = node._evaluateRegExp;
        } else if (node._type === ExpressionNodeType.LITERAL_GLOBAL) {
            if (node._value === 'TILES3D_TILESET_TIME') {
                node.evaluate = evaluateTime;
            }
        } else {
            node.evaluate = node._evaluateLiteral;
        }
    }

    function evaluateTime(frameState, feature) {
        return feature._content._tileset.timeSinceLoad;
    }

    function getEvaluateUnaryFunction(call) {
        var evaluate = unaryFunctions[call];
        return function(feature) {
            return evaluate(this._left.evaluate(feature));
        };
    }

    function getEvaluateBinaryFunction(call) {
        var evaluate = binaryFunctions[call];
        return function(feature) {
            return evaluate(this._left.evaluate(feature), this._right.evaluate(feature));
        };
    }

    function getEvaluateTernaryFunction(call) {
        var evaluate = ternaryFunctions[call];
        return function(feature) {
            return evaluate(this._left.evaluate(feature), this._right.evaluate(feature), this._test.evaluate(feature));
        };
    }

    Node.prototype._evaluateLiteral = function(frameState, feature) {
        return this._value;
    };

    Node.prototype._evaluateLiteralColor = function(frameState, feature) {
        var result = ScratchStorage.getColor();
        var args = this._left;
        if (this._value === 'color') {
            if (!defined(args)) {
                return Color.fromBytes(255, 255, 255, 255, result);
            } else if (args.length > 1) {
                Color.fromCssColorString(args[0].evaluate(frameState, feature), result);
                result.alpha = args[1].evaluate(frameState, feature);
            } else {
                Color.fromCssColorString(args[0].evaluate(frameState, feature), result);
            }
        } else if (this._value === 'rgb') {
            Color.fromBytes(
                args[0].evaluate(frameState, feature),
                args[1].evaluate(frameState, feature),
                args[2].evaluate(frameState, feature),
                255, result);
        } else if (this._value === 'rgba') {
            // convert between css alpha (0 to 1) and cesium alpha (0 to 255)
            var a = args[3].evaluate(frameState, feature) * 255;
            Color.fromBytes(
                args[0].evaluate(frameState, feature),
                args[1].evaluate(frameState, feature),
                args[2].evaluate(frameState, feature),
                a, result);
        } else if (this._value === 'hsl') {
            Color.fromHsl(
                args[0].evaluate(frameState, feature),
                args[1].evaluate(frameState, feature),
                args[2].evaluate(frameState, feature),
                1.0, result);
        } else if (this._value === 'hsla') {
            Color.fromHsl(
                args[0].evaluate(frameState, feature),
                args[1].evaluate(frameState, feature),
                args[2].evaluate(frameState, feature),
                args[3].evaluate(frameState, feature),
                result);
        }
        return result;
    };

    function evaluateVec2(components) {

    }

    function evaluateVec3(components) {

    }

    function evaluateVec4(components) {

    }

    var scratchComponents = [];
    Node.prototype._evaluateLiteralVector = function(frameState, feature) {
        // Gather the components that make up the vector, which includes components from interior vectors.
        // For example vec3(1, 2, 3) or vec3(vec2(1, 2), 3) are both valid.
        //
        // If the number of components does not equal the vector's size, then a DeveloperError is thrown - with two exceptions:
        // 1. A vector may be constructed from a larger vector and drop the extra components.
        // 2. A vector may be constructed from a single component - vec3(1) will become vec3(1, 1, 1).
        //
        // Examples of invalid constructors include:
        // vec4(1, 2)        // not enough components
        // vec3(vec2(1, 2))  // not enough components
        // vec3(1, 2, 3, 4)  // too many components
        // vec2(vec4(1), 1)  // too many components

        var components = scratchComponents;
        components.length = 0;

        var args = this._left;
        var argsLength = args.length;
        for (var i = 0; i < argsLength; ++i) {
            var value = args[i].evaluate(frameState, feature);
            if (value instanceof Cartesian2) {
                components.push(value.x, value.y);
            } else if (value instanceof Cartesian3) {
                components.push(value.x, value.y, value.z);
            } else if (value instanceof Cartesian4) {
                components.push(value.x, value.x, value.y, value.w);
            } else if (typeof(value) === 'number') {
                components.push(value);
            }
        }

        var componentsLength = components.length;
        var call = this._value;
        var vectorLength = parseInt(call.charAt(3));

        if (componentsLength === 0) {
            // vec2()
        } else if (componentsLength === 1) {
            // vec2(1)
        } else if (componentsLength < vectorLength) {
            // vec4(vec2(1, 2), 3)
        } else if ((componentsLength > vectorLength) && (argsLength > 1)) {
            // vec3(vec3(1, 2, 3), 4)
            //>>includeStart('debug', pragmas.debug);
            throw new DeveloperError('Error: Invalid ' + call + ' constructor. Too many arguments.');
            //>>includeEnd('debug');
        }

        if (componentsLength > 1 && componentsLength < vectorLength)

            if (argsLength > 1 && componentsLength > )


                if (componentsLength === 1) {
                    // Add the same component 3 more times
                    components.push(components[0]);
                    components.push(components[0]);
                    components.push(components[0]);
                }


        if (type === 'vec2') {
            evaluateVec2(components);
        }









        return Cartesian4.fromElements(
            args[0].evaluate(frameState, feature),
            args[1].evaluate(frameState, feature),
            args[2].evaluate(frameState, feature),
            args[3].evaluate(frameState, feature),
            result);
    };

    Node.prototype._evaluateLiteralString = function(frameState, feature) {
        return this._value;
    };

    Node.prototype._evaluateVariableString = function(frameState, feature) {
        var result = this._value;
        var match = variableRegex.exec(result);
        while (match !== null) {
            var placeholder = match[0];
            var variableName = match[1];
            var property = feature.getProperty(variableName);
            if (!defined(property)) {
                property = '';
            }
            result = result.replace(placeholder, property);
            match = variableRegex.exec(result);
        }
        return result;
    };

    Node.prototype._evaluateVariable = function(frameState, feature) {
        // evaluates to undefined if the property name is not defined for that feature
        return feature.getProperty(this._value);
    };

    function checkFeature (ast) {
        return (ast._value === 'feature');
    }

    // PERFORMANCE_IDEA: Determine if parent property needs to be computed before runtime
    Node.prototype._evaluateMemberDot = function(frameState, feature) {
        if (checkFeature(this._left)) {
            return feature.getProperty(this._right.evaluate(frameState, feature));
        }
        var property = this._left.evaluate(frameState, feature);
        if (!defined(property)) {
            return undefined;
        }

        var member = this._right.evaluate(frameState, feature);
        if (property instanceof Color) {
            // Color components may be accessed with .x, .y, .z, .w and implicitly with .red, .green, .blue, .alpha
            if (member === 'x') {
                return property.red;
            } else if (member === 'y') {
                return property.green;
            } else if (member === 'z') {
                return property.blue;
            } else if (member === 'w') {
                return property.alpha;
            }
        }

        return property[member];
    };

    Node.prototype._evaluateMemberBrackets = function(frameState, feature) {
        if (checkFeature(this._left)) {
            return feature.getProperty(this._right.evaluate(frameState, feature));
        }
        var property = this._left.evaluate(frameState, feature);
        if (!defined(property)) {
            return undefined;
        }

        var member = this._right.evaluate(frameState, feature);
        if (property instanceof Color) {
            // Color components may be accessed with [0][1][2][3], ['x']['y']['z']['w'], and implicitly with ['red']['green']['blue']['alpha']
            if (member === 0 || member === 'x') {
                return property.red;
            } else if (member === 1 || member === 'y') {
                return property.green;
            } else if (member === 2 || member === 'z') {
                return property.blue;
            } else if (member === 3 || member === 'w') {
                return property.alpha;
            }
        } else if ((property instanceof Cartesian2) || (property instanceof Cartesian3) || (property instanceof Cartesian4)) {
            // Vector components may be accessed with [0][1][2][3] and implicitly with ['x']['y']['z']['w']
            // For Cartesian2 and Cartesian3 out-of-range components will just return undefined
            if (member === 0) {
                return property.x;
            } else if (member === 1) {
                return property.y;
            } else if (member === 2) {
                return property.z;
            } else if (member === 3) {
                return property.w;
            }
        }
        return property[member];
    };

    Node.prototype._evaluateArray = function(frameState, feature) {
        var array = [];
        for (var i = 0; i < this._value.length; i++) {
            array[i] = this._value[i].evaluate(frameState, feature);
        }
        return array;
    };

    // PERFORMANCE_IDEA: Have "fast path" functions that deal only with specific types
    // that we can assign if we know the types before runtime

    Node.prototype._evaluateNot = function(frameState, feature) {
        return !(this._left.evaluate(frameState, feature));
    };

    Node.prototype._evaluateNegative = function(frameState, feature) {
        var left = this._left.evaluate(frameState, feature);
        if (left instanceof Cartesian2) {
            return Cartesian2.negate(left, ScratchStorage.getCartesian2());
        } else if (left instanceof Cartesian3) {
            return Cartesian3.negate(left, ScratchStorage.getCartesian3());
        } else if (left instanceof Cartesian4) {
            return Cartesian4.negate(left, ScratchStorage.getCartesian4());
        }
        return -left;
    };

    Node.prototype._evaluatePositive = function(frameState, feature) {
        var left = this._left.evaluate(frameState, feature);
        if ((left instanceof Color) || (left instanceof Cartesian2) || (left instanceof Cartesian3) || (left instanceof Cartesian4)) {
            return left;
        }
        return +left;
    };

    Node.prototype._evaluateLessThan = function(frameState, feature) {
        var left = this._left.evaluate(frameState, feature);
        var right = this._right.evaluate(frameState, feature);
        return left < right;
    };

    Node.prototype._evaluateLessThanOrEquals = function(frameState, feature) {
        var left = this._left.evaluate(frameState, feature);
        var right = this._right.evaluate(frameState, feature);
        return left <= right;
    };

    Node.prototype._evaluateGreaterThan = function(frameState, feature) {
        var left = this._left.evaluate(frameState, feature);
        var right = this._right.evaluate(frameState, feature);
        return left > right;
    };

    Node.prototype._evaluateGreaterThanOrEquals = function(frameState, feature) {
        var left = this._left.evaluate(frameState, feature);
        var right = this._right.evaluate(frameState, feature);
        return left >= right;
    };

    Node.prototype._evaluateOr = function(frameState, feature) {
        var left = this._left.evaluate(frameState, feature);
        //>>includeStart('debug', pragmas.debug);
        if (typeof(left) !== 'boolean') {
            throw new DeveloperError('Error: Operation is undefined.');
        }
        //>>includeEnd('debug');

        // short circuit the expression
        if (left) {
            return true;
        }

        var right = this._right.evaluate(frameState, feature);
        //>>includeStart('debug', pragmas.debug);
        if (typeof(right) !== 'boolean') {
            throw new DeveloperError('Error: Operation is undefined.');
        }
        //>>includeEnd('debug');
        return left || right;
    };

    Node.prototype._evaluateAnd = function(frameState, feature) {
        var left = this._left.evaluate(frameState, feature);
        //>>includeStart('debug', pragmas.debug);
        if (typeof(left) !== 'boolean') {
            throw new DeveloperError('Error: Operation is undefined.');
        }
        //>>includeEnd('debug');

        // short circuit the expression
        if (!left) {
            return false;
        }

        var right = this._right.evaluate(frameState, feature);
        //>>includeStart('debug', pragmas.debug);
        if (typeof(right) !== 'boolean') {
            throw new DeveloperError('Error: Operation is undefined.');
        }
        //>>includeEnd('debug');
        return left && right;
    };

    Node.prototype._evaluatePlus = function(frameState, feature) {
        var left = this._left.evaluate(frameState, feature);
        var right = this._right.evaluate(frameState, feature);
        if ((right instanceof Color) && (left instanceof Color)) {
            return Color.add(left, right, ScratchStorage.getColor());
        } else if ((right instanceof Cartesian2) && (left instanceof Cartesian2)) {
            return Cartesian2.add(left, right, ScratchStorage.getCartesian2());
        } else if ((right instanceof Cartesian3) && (left instanceof Cartesian3)) {
            return Cartesian3.add(left, right, ScratchStorage.getCartesian3());
        } else if ((right instanceof Cartesian4) && (left instanceof Cartesian4)) {
            return Cartesian4.add(left, right, ScratchStorage.getCartesian4());
        }
        return left + right;
    };

    Node.prototype._evaluateMinus = function(frameState, feature) {
        var left = this._left.evaluate(frameState, feature);
        var right = this._right.evaluate(frameState, feature);
        if ((right instanceof Color) && (left instanceof Color)) {
            return Color.subtract(left, right, ScratchStorage.getColor());
        } else if ((right instanceof Cartesian2) && (left instanceof Cartesian2)) {
            return Cartesian2.subtract(left, right, ScratchStorage.getCartesian2());
        } else if ((right instanceof Cartesian3) && (left instanceof Cartesian3)) {
            return Cartesian3.subtract(left, right, ScratchStorage.getCartesian3());
        } else if ((right instanceof Cartesian4) && (left instanceof Cartesian4)) {
            return Cartesian4.subtract(left, right, ScratchStorage.getCartesian4());
        }
        return left - right;
    };

    Node.prototype._evaluateTimes = function(frameState, feature) {
        var left = this._left.evaluate(frameState, feature);
        var right = this._right.evaluate(frameState, feature);
        if ((right instanceof Color) && (left instanceof Color)) {
            return Color.multiply(left, right, ScratchStorage.getColor());
        } else if ((right instanceof Color) && (typeof(left) === 'number')) {
            return Color.multiplyByScalar(right, left, ScratchStorage.getColor());
        } else if ((left instanceof Color) && (typeof(right) === 'number')) {
            return Color.multiplyByScalar(left, right, ScratchStorage.getColor());
        } else if ((right instanceof Cartesian2) && (left instanceof Cartesian2)) {
            return Cartesian2.multiplyComponents(left, right, ScratchStorage.getCartesian2());
        } else if ((right instanceof Cartesian2) && (typeof(left) === 'number')) {
            return Cartesian2.multiplyByScalar(right, left, ScratchStorage.getCartesian2());
        } else if ((left instanceof Cartesian2) && (typeof(right) === 'number')) {
            return Cartesian2.multiplyByScalar(left, right, ScratchStorage.getCartesian2());
        } else if ((right instanceof Cartesian3) && (left instanceof Cartesian3)) {
            return Cartesian3.multiplyComponents(left, right, ScratchStorage.getCartesian3());
        } else if ((right instanceof Cartesian3) && (typeof(left) === 'number')) {
            return Cartesian3.multiplyByScalar(right, left, ScratchStorage.getCartesian3());
        } else if ((left instanceof Cartesian3) && (typeof(right) === 'number')) {
            return Cartesian3.multiplyByScalar(left, right, ScratchStorage.getCartesian3());
        } else if ((right instanceof Cartesian4) && (left instanceof Cartesian4)) {
            return Cartesian4.multiplyComponents(left, right, ScratchStorage.getCartesian4());
        } else if ((right instanceof Cartesian4) && (typeof(left) === 'number')) {
            return Cartesian4.multiplyByScalar(right, left, ScratchStorage.getCartesian4());
        } else if ((left instanceof Cartesian4) && (typeof(right) === 'number')) {
            return Cartesian4.multiplyByScalar(left, right, ScratchStorage.getCartesian4());
        }
        return left * right;
    };

    Node.prototype._evaluateDivide = function(frameState, feature) {
        var left = this._left.evaluate(frameState, feature);
        var right = this._right.evaluate(frameState, feature);
        if ((right instanceof Color) && (left instanceof Color)) {
            return Color.divide(left, right, ScratchStorage.getColor());
        } else if ((left instanceof Color) && (typeof(right) === 'number')) {
            return Color.divideByScalar(left, right, ScratchStorage.getColor());
        } else if ((right instanceof Cartesian2) && (left instanceof Cartesian2)) {
            return Cartesian2.divideComponents(left, right, ScratchStorage.getCartesian2());
        } else if ((left instanceof Cartesian2) && (typeof(right) === 'number')) {
            return Cartesian2.divideByScalar(left, right, ScratchStorage.getCartesian2());
        } else if ((right instanceof Cartesian3) && (left instanceof Cartesian3)) {
            return Cartesian3.divideComponents(left, right, ScratchStorage.getCartesian3());
        } else if ((left instanceof Cartesian3) && (typeof(right) === 'number')) {
            return Cartesian3.divideByScalar(left, right, ScratchStorage.getCartesian3());
        } else if ((right instanceof Cartesian4) && (left instanceof Cartesian4)) {
            return Cartesian4.divideComponents(left, right, ScratchStorage.getCartesian4());
        } else if ((left instanceof Cartesian4) && (typeof(right) === 'number')) {
            return Cartesian4.divideByScalar(left, right, ScratchStorage.getCartesian4());
        }
        return left / right;
    };

    Node.prototype._evaluateMod = function(frameState, feature) {
        var left = this._left.evaluate(frameState, feature);
        var right = this._right.evaluate(frameState, feature);
        if ((right instanceof Color) && (left instanceof Color)) {
            return Color.mod(left, right, ScratchStorage.getColor());
        } else if ((right instanceof Cartesian2) && (left instanceof Cartesian2)) {
            return Cartesian2.fromElements(left.x % right.x, left.y % right.y, ScratchStorage.getCartesian2());
        } else if ((right instanceof Cartesian3) && (left instanceof Cartesian3)) {
            return Cartesian3.fromElements(left.x % right.x, left.y % right.y, left.z % right.z, ScratchStorage.getCartesian3());
        } else if ((right instanceof Cartesian4) && (left instanceof Cartesian4)) {
            return Cartesian4.fromElements(left.x % right.x, left.y % right.y, left.z % right.z, left.w % right.w, ScratchStorage.getCartesian4());
        }
        return left % right;
    };

    Node.prototype._evaluateEqualsStrict = function(frameState, feature) {
        var left = this._left.evaluate(frameState, feature);
        var right = this._right.evaluate(frameState, feature);
        if ((right instanceof Color) && (left instanceof Color) ||
            (right instanceof Cartesian2) && (left instanceof Cartesian2) ||
            (right instanceof Cartesian3) && (left instanceof Cartesian3) ||
            (right instanceof Cartesian4) && (left instanceof Cartesian4)) {
            return left.equals(right);
        }
        return left === right;
    };

    Node.prototype._evaluateEquals = function(frameState, feature) {
        var left = this._left.evaluate(frameState, feature);
        var right = this._right.evaluate(frameState, feature);
        if ((right instanceof Color) && (left instanceof Color) ||
            (right instanceof Cartesian2) && (left instanceof Cartesian2) ||
            (right instanceof Cartesian3) && (left instanceof Cartesian3) ||
            (right instanceof Cartesian4) && (left instanceof Cartesian4)) {
            return left.equals(right);
        }

        // Specifically want to do an abstract equality comparison (==) instead of a strict equality comparison (===)
        // so that cases like "5 == '5'" return true. Tell jsHint to ignore this line.
        return left == right; // jshint ignore:line
    };

    Node.prototype._evaluateNotEqualsStrict = function(frameState, feature) {
        var left = this._left.evaluate(frameState, feature);
        var right = this._right.evaluate(frameState, feature);
        if ((right instanceof Color) && (left instanceof Color) ||
            (right instanceof Cartesian2) && (left instanceof Cartesian2) ||
            (right instanceof Cartesian3) && (left instanceof Cartesian3) ||
            (right instanceof Cartesian4) && (left instanceof Cartesian4)) {
            return !left.equals(right);
        }
        return left !== right;
    };

    Node.prototype._evaluateNotEquals = function(frameState, feature) {
        var left = this._left.evaluate(frameState, feature);
        var right = this._right.evaluate(frameState, feature);
        if ((right instanceof Color) && (left instanceof Color) ||
            (right instanceof Cartesian2) && (left instanceof Cartesian2) ||
            (right instanceof Cartesian3) && (left instanceof Cartesian3) ||
            (right instanceof Cartesian4) && (left instanceof Cartesian4)) {
            return !left.equals(right);
        }
        // Specifically want to do an abstract inequality comparison (!=) instead of a strict inequality comparison (!==)
        // so that cases like "5 != '5'" return false. Tell jsHint to ignore this line.
        return left != right; // jshint ignore:line
    };

    Node.prototype._evaluateConditional = function(frameState, feature) {
        if (this._test.evaluate(frameState, feature)) {
            return this._left.evaluate(frameState, feature);
        }
        return this._right.evaluate(frameState, feature);
    };

    Node.prototype._evaluateNaN = function(frameState, feature) {
        return isNaN(this._left.evaluate(frameState, feature));
    };

    Node.prototype._evaluateIsFinite = function(frameState, feature) {
        return isFinite(this._left.evaluate(frameState, feature));
    };

    Node.prototype._evaluateIsExactClass = function(frameState, feature) {
        return feature.isExactClass(this._left.evaluate(frameState, feature));
    };

    Node.prototype._evaluateIsClass = function(frameState, feature) {
        return feature.isClass(this._left.evaluate(frameState, feature));
    };

    Node.prototype._evaluategetExactClassName = function(frameState, feature) {
        return feature.getExactClassName();
    };

    Node.prototype._evaluateBooleanConversion = function(frameState, feature) {
        return Boolean(this._left.evaluate(frameState, feature));
    };

    Node.prototype._evaluateNumberConversion = function(frameState, feature) {
        return Number(this._left.evaluate(frameState, feature));
    };

    Node.prototype._evaluateStringConversion = function(frameState, feature) {
        return String(this._left.evaluate(frameState, feature));
    };

    Node.prototype._evaluateRegExp = function(frameState, feature) {
        var pattern = this._value.evaluate(frameState, feature);
        var flags = '';

        if (defined(this._left)) {
            flags = this._left.evaluate(frameState, feature);
        }

        var exp;
        try {
            exp = new RegExp(pattern, flags);
        } catch (e) {
            //>>includeStart('debug', pragmas.debug);
            throw new DeveloperError(e);
            //>>includeEnd('debug');
        }
        return exp;
    };

    Node.prototype._evaluateRegExpTest = function(frameState, feature) {
        return this._left.evaluate(frameState, feature).test(this._right.evaluate(frameState, feature));
    };

    Node.prototype._evaluateRegExpMatch = function(frameState, feature) {
        var left = this._left.evaluate(frameState, feature);
        var right = this._right.evaluate(frameState, feature);
        if (left instanceof RegExp) {
            return left.test(right);
        } else if (right instanceof RegExp) {
            return right.test(left);
        } else {
            return false;
        }
    };

    Node.prototype._evaluateRegExpNotMatch = function(frameState, feature) {
        var left = this._left.evaluate(frameState, feature);
        var right = this._right.evaluate(frameState, feature);
        if (left instanceof RegExp) {
            return !(left.test(right));
        } else if (right instanceof RegExp) {
            return !(right.test(left));
        } else {
            return false;
        }
    };

    Node.prototype._evaluateRegExpExec = function(frameState, feature) {
        var exec = this._left.evaluate(frameState, feature).exec(this._right.evaluate(frameState, feature));
        if (!defined(exec)) {
            return null;
        }
        return exec[1];
    };

    Node.prototype._evaluateToString = function(frameState, feature) {
        var left = this._left.evaluate(frameState, feature);
        if ((left instanceof RegExp) || (left instanceof Color) || (left instanceof Cartesian2) || (left instanceof Cartesian3) || (left instanceof Cartesian4)) {
            return String(left);
        }
        //>>includeStart('debug', pragmas.debug);
        else {
            throw new DeveloperError('Error: Unexpected function call "' + this._value + '".');
        }
        //>>includeEnd('debug');
    };

    function convertHSLToRGB(ast) {
        // Check if the color contains any nested expressions to see if the color can be converted here.
        // E.g. "hsl(0.9, 0.6, 0.7)" is able to convert directly to rgb, "hsl(0.9, 0.6, ${Height})" is not.
        var channels = ast._left;
        var length = channels.length;
        for (var i = 0; i < length; ++i) {
            if (channels[i]._type !== ExpressionNodeType.LITERAL_NUMBER) {
                return undefined;
            }
        }
        var h = channels[0]._value;
        var s = channels[1]._value;
        var l = channels[2]._value;
        var a = (length === 4) ? channels[3]._value : 1.0;
        return Color.fromHsl(h, s, l, a, scratchColor);
    }

    function convertRGBToColor(ast) {
        // Check if the color contains any nested expressions to see if the color can be converted here.
        // E.g. "rgb(255, 255, 255)" is able to convert directly to Color, "rgb(255, 255, ${Height})" is not.
        var channels = ast._left;
        var length = channels.length;
        for (var i = 0; i < length; ++i) {
            if (channels[i]._type !== ExpressionNodeType.LITERAL_NUMBER) {
                return undefined;
            }
        }
        var color = scratchColor;
        color.red = channels[0]._value / 255.0;
        color.green = channels[1]._value / 255.0;
        color.blue = channels[2]._value / 255.0;
        color.alpha = (length === 4) ? channels[3]._value : 1.0;
        return color;
    }

    function numberToString(number) {
        if (number % 1 === 0) {
            // Add a .0 to whole numbers
            return number.toFixed(1);
        } else {
            return number.toString();
        }
    }

    function colorToVec3(color) {
        var r = numberToString(color.red);
        var g = numberToString(color.green);
        var b = numberToString(color.blue);
        return 'vec3(' + r + ', ' + g + ', ' + b + ')';
    }

    function colorToVec4(color) {
        var r = numberToString(color.red);
        var g = numberToString(color.green);
        var b = numberToString(color.blue);
        var a = numberToString(color.alpha);
        return 'vec4(' + r + ', ' + g + ', ' + b + ', ' + a + ')';
    }

    function getExpressionArray(array, attributePrefix, shaderState) {
        var length = array.length;
        var expressions = new Array(length);
        for (var i = 0; i < length; ++i) {
            var shader = array[i].getShaderExpression(attributePrefix, shaderState);
            if (!defined(shader)) {
                // If any of the expressions are not valid, the array is not valid
                return undefined;
            }
            expressions[i] = shader;
        }
        return expressions;
    }

    Node.prototype.getShaderExpression = function(attributePrefix, shaderState) {
        var color;
        var left;
        var right;
        var test;

        var type = this._type;
        var value = this._value;

        if (defined(this._left)) {
            if (isArray(this._left)) {
                // Left can be an array if the type is LITERAL_COLOR or LITERAL_VECTOR
                left = getExpressionArray(this._left, attributePrefix, shaderState);
            } else {
                left = this._left.getShaderExpression(attributePrefix, shaderState);
            }
            if (!defined(left)) {
                // If the left side is not valid shader code, then the expression is not valid
                return undefined;
            }
        }

        if (defined(this._right)) {
            right = this._right.getShaderExpression(attributePrefix, shaderState);
            if (!defined(right)) {
                // If the right side is not valid shader code, then the expression is not valid
                return undefined;
            }
        }

        if (defined(this._test)) {
            test = this._test.getShaderExpression(attributePrefix, shaderState);
            if (!defined(test)) {
                // If the test is not valid shader code, then the expression is not valid
                return undefined;
            }
        }

        if (isArray(this._value)) {
            // For ARRAY type
            value = getExpressionArray(this._value, attributePrefix, shaderState);
            if (!defined(value)) {
                // If the values are not valid shader code, then the expression is not valid
                return undefined;
            }
        }

        switch (type) {
            case ExpressionNodeType.VARIABLE:
                return attributePrefix + value;
            case ExpressionNodeType.UNARY:
                // Supported types: +, -, !, Boolean, Number
                if (value === 'Boolean') {
                    return 'bool(' + left + ')';
                } else if (value === 'Number') {
                    return 'float(' + left + ')';
                } else if (value === 'abs') {
                    return 'abs(' + left + ')';
                } else if (value === 'cos') {
                    return 'cos(' + left + ')';
                } else if (value === 'sqrt') {
                    return 'sqrt(' + left + ')';
                } else if ((value === 'isNaN') || (value === 'isFinite') || (value === 'String') || (value === 'isExactClass') || (value === 'isClass') || (value === 'getExactClassName')) {
                    //>>includeStart('debug', pragmas.debug);
                    throw new DeveloperError('Error generating style shader: "' + value + '" is not supported.');
                    //>>includeEnd('debug');
                    // Return undefined when not in debug. Tell jsHint to ignore this line.
                    return undefined; // jshint ignore:line
                } else if (defined(unaryFunctions[value])) {
                    return value + '(' + left + ')';
                }
                return value + left;
            case ExpressionNodeType.BINARY:
                // Supported types: ||, &&, ===, ==, !==, !=, <, >, <=, >=, +, -, *, /, %
                if (value === '%') {
                    return 'mod(' + left + ', ' + right + ')';
                } else if (value === '===') {
                    return '(' + left + ' == ' + right + ')';
                } else if (value === '!==') {
                    return '(' + left + ' != ' + right + ')';
                } else if (value === 'atan2') {
                    return 'atan(' + left + ', ' + right + ')';
                } else if (defined(binaryFunctions[value])) {
                    return value + '(' + left + ', ' + right + ')';
                }
                return '(' + left + ' ' + value + ' ' + right + ')';
            case ExpressionNodeType.TERNARY:
                if (defined(ternaryFunctions[value])) {
                    return value + '(' + left + ', ' + right + ', ' + test + ')';
                }
                break;
            case ExpressionNodeType.CONDITIONAL:
                return '(' + test + ' ? ' + left + ' : ' + right + ')';
            case ExpressionNodeType.MEMBER:
                // This is intended for accessing the components of vec4 properties. String members aren't supported.
                // Check for 0.0 rather than 0 because all numbers are previously converted to decimals.
                // In this shader there is not much distinction between colors and vectors so allow .red to access the 0th component for both.
                if (right === 'red' || right === 'x' || right === '0.0') {
                    return left + '[0]';
                } else if (right === 'green' || right === 'y' || right === '1.0') {
                    return left + '[1]';
                } else if (right === 'blue' || right === 'z' || right === '2.0') {
                    return left + '[2]';
                } else if (right === 'alpha' || right === 'w' || right === '3.0') {
                    return left + '[3]';
                }
                return left + '[int(' + right + ')]';
            case ExpressionNodeType.FUNCTION_CALL:
                //>>includeStart('debug', pragmas.debug);
                throw new DeveloperError('Error generating style shader: "' + value + '" is not supported.');
                //>>includeEnd('debug');
            case ExpressionNodeType.ARRAY:
                if (value.length === 4) {
                    return 'vec4(' + value[0] + ', ' + value[1] + ', ' + value[2] + ', ' + value[3] + ')';
                } else if (value.length === 3) {
                    return 'vec3(' + value[0] + ', ' + value[1] + ', ' + value[2] + ')';
                } else if (value.length === 2) {
                    return 'vec2(' + value[0] + ', ' + value[1] + ')';
                }
                //>>includeStart('debug', pragmas.debug);
                else {
                    throw new DeveloperError('Error generating style shader: Invalid array length. Array length should be 2, 3, or 4.');
                }
                //>>includeEnd('debug');
                break;
            case ExpressionNodeType.REGEX:
                //>>includeStart('debug', pragmas.debug);
                throw new DeveloperError('Error generating style shader: Regular expressions are not supported.');
                //>>includeEnd('debug');
            case ExpressionNodeType.VARIABLE_IN_STRING:
                //>>includeStart('debug', pragmas.debug);
                throw new DeveloperError('Error generating style shader: Converting a variable to a string is not supported.');
                //>>includeEnd('debug');
            case ExpressionNodeType.LITERAL_NULL:
                //>>includeStart('debug', pragmas.debug);
                throw new DeveloperError('Error generating style shader: null is not supported.');
                //>>includeEnd('debug');
            case ExpressionNodeType.LITERAL_BOOLEAN:
                return value ? 'true' : 'false';
            case ExpressionNodeType.LITERAL_NUMBER:
                return numberToString(value);
            case ExpressionNodeType.LITERAL_STRING:
                // The only supported strings are css color strings
                // ['red'], ['x'], and equivalent getters/setters are not supported
                color = Color.fromCssColorString(value, scratchColor);
                if (defined(color)) {
                    return colorToVec3(color);
                }
                //>>includeStart('debug', pragmas.debug);
                throw new DeveloperError('Error generating style shader: String literals are not supported.');
                //>>includeEnd('debug');
            case ExpressionNodeType.LITERAL_COLOR:
                var args = left;
                if (value === 'color') {
                    if (!defined(args)) {
                        return 'vec4(1.0)';
                    } else if (args.length > 1) {
                        var rgb = args[0];
                        var alpha = args[1];
                        if (alpha !== '1.0') {
                            shaderState.translucent = true;
                        }
                        return 'vec4(' + rgb + ', ' + alpha + ')';
                    } else {
                        return 'vec4(' + args[0] + ', 1.0)';
                    }
                } else if (value === 'rgb') {
                    color = convertRGBToColor(this);
                    if (defined(color)) {
                        return colorToVec4(color);
                    } else {
                        return 'vec4(' + args[0] + ' / 255.0, ' + args[1] + ' / 255.0, ' + args[2] + ' / 255.0, 1.0)';
                    }
                } else if (value === 'rgba') {
                    if (args[3] !== '1.0') {
                        shaderState.translucent = true;
                    }
                    color = convertRGBToColor(this);
                    if (defined(color)) {
                        return colorToVec4(color);
                    } else {
                        return 'vec4(' + args[0] + ' / 255.0, ' + args[1] + ' / 255.0, ' + args[2] + ' / 255.0, ' + args[3] + ')';
                    }
                } else if (value === 'hsl') {
                    color = convertHSLToRGB(this);
                    if (defined(color)) {
                        return colorToVec4(color);
                    } else {
                        return 'vec4(czm_HSLToRGB(vec3(' + args[0] + ', ' + args[1] + ', ' + args[2] + ')), 1.0)';
                    }
                } else if (value === 'hsla') {
                    color = convertHSLToRGB(this);
                    if (defined(color)) {
                        if (color.alpha !== 1.0) {
                            shaderState.translucent = true;
                        }
                        return colorToVec4(color);
                    } else {
                        if (args[3] !== '1.0') {
                            shaderState.translucent = true;
                        }
                        return 'vec4(czm_HSLToRGB(vec3(' + args[0] + ', ' + args[1] + ', ' + args[2] + ')), ' + args[3] + ')';
                    }
                }
                break;
            case ExpressionNodeType.LITERAL_VECTOR:
                return 'vec4(' + left[0] + ', ' + left[1] + ', ' + left[2] + ', ' + left[3] + ')';
            case ExpressionNodeType.LITERAL_REGEX:
                //>>includeStart('debug', pragmas.debug);
                throw new DeveloperError('Error generating style shader: Regular expressions are not supported.');
                //>>includeEnd('debug');
            case ExpressionNodeType.LITERAL_UNDEFINED:
                //>>includeStart('debug', pragmas.debug);
                throw new DeveloperError('Error generating style shader: undefined is not supported.');
                //>>includeEnd('debug');
            case ExpressionNodeType.LITERAL_GLOBAL:
                if (value === 'TILES3D_TILESET_TIME') {
                    return 'u_tilesetTime';
                }
        }
    };

    return Expression;
});
