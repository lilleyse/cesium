/*global define*/
define([
        '../Core/AssociativeArray',
        '../Core/Color',
        '../Core/ColorGeometryInstanceAttribute',
        '../Core/defined',
        '../Core/ShowGeometryInstanceAttribute',
        '../Scene/PerInstanceColorAppearance',
        '../Scene/Primitive',
        './BoundingSphereState'
    ], function(
        AssociativeArray,
        Color,
        ColorGeometryInstanceAttribute,
        defined,
        ShowGeometryInstanceAttribute,
        PerInstanceColorAppearance,
        Primitive,
        BoundingSphereState) {
    'use strict';

    function Batch(primitives, translucent, width, castShadows, receiveShadows) {
        this.translucent = translucent;
        this.castShadows = castShadows;
        this.receiveShadows = receiveShadows;
        this.primitives = primitives;
        this.createPrimitive = false;
        this.waitingOnCreate = false;
        this.primitive = undefined;
        this.oldPrimitive = undefined;
        this.geometry = new AssociativeArray();
        this.updaters = new AssociativeArray();
        this.updatersWithAttributes = new AssociativeArray();
        this.attributes = new AssociativeArray();
        this.itemsToRemove = [];
        this.width = width;
        this.subscriptions = new AssociativeArray();
        this.showsUpdated = new AssociativeArray();
    }
    Batch.prototype.add = function(updater, instance) {
        var id = updater.entity.id;
        this.createPrimitive = true;
        this.geometry.set(id, instance);
        this.updaters.set(id, updater);
        if (!updater.hasConstantOutline || !updater.outlineColorProperty.isConstant) {
            this.updatersWithAttributes.set(id, updater);
        } else {
            var that = this;
            this.subscriptions.set(id, updater.entity.definitionChanged.addEventListener(function(entity, propertyName, newValue, oldValue) {
                if (propertyName === 'isShowing') {
                    that.showsUpdated.set(entity.id, updater);
                }
            }));
        }
    };

    Batch.prototype.remove = function(updater) {
        var id = updater.entity.id;
        this.createPrimitive = this.geometry.remove(id) || this.createPrimitive;
        if (this.updaters.remove(id)) {
            this.updatersWithAttributes.remove(id);
            var unsubscribe = this.subscriptions.get(id);
            if (defined(unsubscribe)) {
                unsubscribe();
                this.subscriptions.remove(id);
            }
        }
    };

    var colorScratch = new Color();
    Batch.prototype.update = function(time) {
        var isUpdated = true;
        var removedCount = 0;
        var primitive = this.primitive;
        var primitives = this.primitives;
        var attributes;
        var i;

        if (this.createPrimitive) {
            var geometries = this.geometry.values;
            var geometriesLength = geometries.length;
            if (geometriesLength > 0) {
                if (defined(primitive)) {
                    if (!defined(this.oldPrimitive)) {
                        this.oldPrimitive = primitive;
                    } else {
                        primitives.remove(primitive);
                    }
                }

                for (i = 0; i < geometriesLength; i++) {
                    var geometryItem = geometries[i];
                    var originalAttributes = geometryItem.attributes;
                    attributes = this.attributes.get(geometryItem.id.id);

                    if (defined(attributes)) {
                        if (defined(originalAttributes.show)) {
                            originalAttributes.show.value = attributes.show;
                        }
                        if (defined(originalAttributes.color)) {
                            originalAttributes.color.value = attributes.color;
                        }
                    }
                }

                primitive = new Primitive({
                    asynchronous : true,
                    geometryInstances : geometries,
                    appearance : new PerInstanceColorAppearance({
                        flat : true,
                        translucent : this.translucent,
                        renderState : {
                            lineWidth : this.width
                        }
                    })
                });

                primitives.add(primitive);
                isUpdated = false;
            } else {
                if (defined(primitive)) {
                    primitives.remove(primitive);
                    primitive = undefined;
                }
                var oldPrimitive = this.oldPrimitive;
                if (defined(oldPrimitive)) {
                    primitives.remove(oldPrimitive);
                    this.oldPrimitive = undefined;
                }
            }

            this.attributes.removeAll();
            this.primitive = primitive;
            this.createPrimitive = false;
            this.waitingOnCreate = true;
        } else if (defined(primitive) && primitive.ready) {
            if (defined(this.oldPrimitive)) {
                primitives.remove(this.oldPrimitive);
                this.oldPrimitive = undefined;
            }

            var updater;
            var updaters = this.updaters.values;
            var updatersWithAttributes = this.updatersWithAttributes.values;
            var length = updatersWithAttributes.length;
            var waitingOnCreate = this.waitingOnCreate;
            for (i = 0; i < length; i++) {
                updater = updatersWithAttributes[i];
                var instance = this.geometry.get(updater.entity.id);

                attributes = this.attributes.get(instance.id.id);
                if (!defined(attributes)) {
                    attributes = primitive.getGeometryInstanceAttributes(instance.id);
                    this.attributes.set(instance.id.id, attributes);
                }

                if (!updater.outlineColorProperty.isConstant || waitingOnCreate) {
                    var outlineColorProperty = updater.outlineColorProperty;
                    outlineColorProperty.getValue(time, colorScratch);
                    if (!Color.equals(attributes._lastColor, colorScratch)) {
                        attributes._lastColor = Color.clone(colorScratch, attributes._lastColor);
                        attributes.color = ColorGeometryInstanceAttribute.toValue(colorScratch, attributes.color);
                        if ((this.translucent && attributes.color[3] === 255) || (!this.translucent && attributes.color[3] !== 255)) {
                            this.itemsToRemove[removedCount++] = updater;
                        }
                    }
                }

                var show = updater.entity.isShowing && (updater.hasConstantOutline || updater.isOutlineVisible(time));
                var currentShow = attributes.show[0] === 1;
                if (show !== currentShow) {
                    attributes.show = ShowGeometryInstanceAttribute.toValue(show, attributes.show);
                }
            }

            length = updaters.length;
            for (i = 0; i < length; i++) {
                updater = updaters[i];
                var castShadows = updater.castShadowsProperty.getValue(time);
                var receiveShadows = updater.receiveShadowsProperty.getValue(time);
                if (this.castShadows !== castShadows || this.receiveShadows !== receiveShadows) {
                    this.itemsToRemove[removedCount++] = updater;
                }
            }

            this.updateShows(primitive);
            this.waitingOnCreate = false;
        } else if (defined(primitive) && !primitive.ready) {
            isUpdated = false;
        }

        this.itemsToRemove.length = removedCount;
        return isUpdated;
    };

    Batch.prototype.updateShows = function(primitive) {
        var showsUpdated = this.showsUpdated.values;
        var length = showsUpdated.length;
        for (var i = 0; i < length; i++) {
            var updater = showsUpdated[i];
            var instance = this.geometry.get(updater.entity.id);

            var attributes = this.attributes.get(instance.id.id);
            if (!defined(attributes)) {
                attributes = primitive.getGeometryInstanceAttributes(instance.id);
                this.attributes.set(instance.id.id, attributes);
            }

            var show = updater.entity.isShowing;
            var currentShow = attributes.show[0] === 1;
            if (show !== currentShow) {
                attributes.show = ShowGeometryInstanceAttribute.toValue(show, attributes.show);
            }
        }
        this.showsUpdated.removeAll();
    };

    Batch.prototype.contains = function(entity) {
        return this.updaters.contains(entity.id);
    };

    Batch.prototype.getBoundingSphere = function(entity, result) {
        var primitive = this.primitive;
        if (!primitive.ready) {
            return BoundingSphereState.PENDING;
        }
        var attributes = primitive.getGeometryInstanceAttributes(entity);
        if (!defined(attributes) || !defined(attributes.boundingSphere) ||//
            (defined(attributes.show) && attributes.show[0] === 0)) {
            return BoundingSphereState.FAILED;
        }
        attributes.boundingSphere.clone(result);
        return BoundingSphereState.DONE;
    };

    Batch.prototype.removeAllPrimitives = function() {
        var primitives = this.primitives;

        var primitive = this.primitive;
        if (defined(primitive)) {
            primitives.remove(primitive);
            this.primitive = undefined;
            this.geometry.removeAll();
            this.updaters.removeAll();
        }

        var oldPrimitive = this.oldPrimitive;
        if (defined(oldPrimitive)) {
            primitives.remove(oldPrimitive);
            this.oldPrimitive = undefined;
        }
    };

    /**
     * @private
     */
    function StaticOutlineGeometryBatch(primitives, scene) {
        this._primitives = primitives;
        this._scene = scene;
        this._batches = new AssociativeArray();
    }
    StaticOutlineGeometryBatch.prototype.add = function(time, updater) {
        var instance = updater.createOutlineGeometryInstance(time);
        var width = this._scene.clampLineWidth(updater.outlineWidth);
        var batches = this._batches;

        var castShadows = updater.castShadowsProperty.getValue(time);
        var receiveShadows = updater.receiveShadowsProperty.getValue(time);
        var translucent = instance.attributes.color.value[3] !== 255;

        var batchKey = '' + (castShadows | 0) + (receiveShadows | 0) + (translucent | 0) + width;
        var batch = batches.get(batchKey);
        if (!defined(batch)) {
            batch = new Batch(this._primitives, translucent, width, castShadows, receiveShadows);
            batches.set(batchKey, batch);
        }
        batch.add(updater, instance);
    };

    StaticOutlineGeometryBatch.prototype.remove = function(updater) {
        var batches = this._batches.values;
        var batchesLength = batches.length;
        for (var i = 0; i < batchesLength; i++) {
            if (batches[i].remove(updater)) {
                return;
            }
        }
    };

    StaticOutlineGeometryBatch.prototype.update = function(time) {
        var batches = this._batches.values;
        var batchesLength = batches.length;
        var isUpdated = true;
        var needUpdate = false;

        do {
            needUpdate = false;
            for (var x = 0; x < batchesLength; x++) {
                var batch = batches[x];
                //Perform initial update
                isUpdated = batch.update(time);

                //If any items swapped between solid/translucent or changed cast/receive shadows,
                //we need to move them between batches
                var itemsToRemove = batch.itemsToRemove;
                var itemsToMoveLength = itemsToRemove.length;
                if (itemsToMoveLength > 0) {
                    needUpdate = true;
                    for (var i = 0; i < itemsToMoveLength; i++) {
                        var updater = itemsToRemove[i];
                        batch.remove(updater);
                        this.add(time, updater);
                    }
                }
            }
        } while (needUpdate);

        return isUpdated;
    };

    StaticOutlineGeometryBatch.prototype.getBoundingSphere = function(entity, result) {
        var batches = this._batches.values;
        var batchesLength = batches.length;
        for (var i = 0; i < batchesLength; i++) {
            var batch = batches[i];
            if (batch.contains(entity)){
                return batch.getBoundingSphere(entity, result);
            }
        }

        return BoundingSphereState.FAILED;
    };

    StaticOutlineGeometryBatch.prototype.removeAllPrimitives = function() {
        var batches = this._batches.values;
        var batchesLength = batches.length;
        for (var i = 0; i < batchesLength; i++) {
            batches[i].removeAllPrimitives();
        }
    };

    return StaticOutlineGeometryBatch;
});
