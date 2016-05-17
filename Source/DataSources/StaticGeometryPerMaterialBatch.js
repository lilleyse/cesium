/*global define*/
define([
        '../Core/AssociativeArray',
        '../Core/defined',
        '../Core/ShowGeometryInstanceAttribute',
        '../Scene/Primitive',
        './BoundingSphereState',
        './MaterialProperty'
    ], function(
        AssociativeArray,
        defined,
        ShowGeometryInstanceAttribute,
        Primitive,
        BoundingSphereState,
        MaterialProperty) {
    'use strict';

    function Batch(primitives, appearanceType, materialProperty, closed) {
        this.primitives = primitives;
        this.appearanceType = appearanceType;
        this.materialProperty = materialProperty;
        this.closed = closed;
        this.updaters = new AssociativeArray();
        this.createPrimitive = true;
        this.primitive = undefined;
        this.oldPrimitive = undefined;
        this.geometry = new AssociativeArray();
        this.material = undefined;
        this.updatersWithAttributes = new AssociativeArray();
        this.attributes = new AssociativeArray();
        this.itemsToRemove = [];
        this.invalidated = false;
        this.removeMaterialSubscription = materialProperty.definitionChanged.addEventListener(Batch.prototype.onMaterialChanged, this);
        this.subscriptions = new AssociativeArray();
        this.showsUpdated = new AssociativeArray();
    }
    Batch.prototype.onMaterialChanged = function() {
        this.invalidated = true;
    };

    Batch.prototype.add = function(time, updater) {
        var id = updater.entity.id;
        this.updaters.set(id, updater);
        this.geometry.set(id, updater.createFillGeometryInstance(time));
        if (!updater.hasConstantFill || !updater.fillMaterialProperty.isConstant) {
            this.updatersWithAttributes.set(id, updater);
        } else {
            var that = this;
            this.subscriptions.set(id, updater.entity.definitionChanged.addEventListener(function(entity, propertyName, newValue, oldValue) {
                if (propertyName === 'isShowing') {
                    that.showsUpdated.set(entity.id, updater);
                }
            }));
        }
        this.createPrimitive = true;
    };

    Batch.prototype.remove = function(updater) {
        var id = updater.entity.id;
        var createPrimitive = this.updaters.remove(id);

        if (createPrimitive) {
            this.geometry.remove(id);
            this.updatersWithAttributes.remove(id);
            var unsubscribe = this.subscriptions.get(id);
            if (defined(unsubscribe)) {
                unsubscribe();
                this.subscriptions.remove(id);
            }
        }
        this.createPrimitive = createPrimitive;
        return createPrimitive;
    };

    Batch.prototype.update = function(time) {
        var isUpdated = true;
        var removedCount = 0;
        var primitive = this.primitive;
        var primitives = this.primitives;
        var geometries = this.geometry.values;
        var attributes;
        var i;

        if (this.createPrimitive) {
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
                    var geometry = geometries[i];
                    var originalAttributes = geometry.attributes;
                    attributes = this.attributes.get(geometry.id.id);

                    if (defined(attributes)) {
                        if (defined(originalAttributes.show)) {
                            originalAttributes.show.value = attributes.show;
                        }
                        if (defined(originalAttributes.color)) {
                            originalAttributes.color.value = attributes.color;
                        }
                    }
                }

                this.material = MaterialProperty.getValue(time, this.materialProperty, this.material);
                primitive = new Primitive({
                    asynchronous : true,
                    geometryInstances : geometries,
                    appearance : new this.appearanceType({
                        material : this.material,
                        translucent : this.material.isTranslucent(),
                        closed : this.closed
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
        } else if (defined(primitive) && primitive.ready) {
            if (defined(this.oldPrimitive)) {
                primitives.remove(this.oldPrimitive);
                this.oldPrimitive = undefined;
            }

            this.material = MaterialProperty.getValue(time, this.materialProperty, this.material);
            this.primitive.appearance.material = this.material;

            var updater;
            var updaters = this.updaters.values;
            var updatersWithAttributes = this.updatersWithAttributes.values;
            var length = updatersWithAttributes.length;
            for (i = 0; i < length; i++) {
                updater = updatersWithAttributes[i];
                var entity = updater.entity;
                var instance = this.geometry.get(entity.id);

                attributes = this.attributes.get(instance.id.id);
                if (!defined(attributes)) {
                    attributes = primitive.getGeometryInstanceAttributes(instance.id);
                    this.attributes.set(instance.id.id, attributes);
                }

                var show = entity.isShowing && (updater.hasConstantFill || updater.isFilled(time));
                var currentShow = attributes.show[0] === 1;
                if (show !== currentShow) {
                    attributes.show = ShowGeometryInstanceAttribute.toValue(show, attributes.show);
                }
            }

            length = updaters.length;
            for (i = 0; i < length; i++) {
                updater = updaters[i];
                if (!updater.castShadowsProperty.isConstant || !updater.receiveShadowsProperty.isConstant) {
                    var castShadows = updater.castShadowsProperty.getValue(time);
                    var receiveShadows = updater.receiveShadowsProperty.getValue(time);
                    if (this.castShadows !== castShadows || this.receiveShadows !== receiveShadows) {
                        this.itemsToRemove[removedCount++] = updater;
                    }
                }
            }

            this.updateShows(primitive);
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
            var entity = updater.entity;
            var instance = this.geometry.get(entity.id);

            var attributes = this.attributes.get(instance.id.id);
            if (!defined(attributes)) {
                attributes = primitive.getGeometryInstanceAttributes(instance.id);
                this.attributes.set(instance.id.id, attributes);
            }

            var show = entity.isShowing;
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

    Batch.prototype.destroy = function(time) {
        var primitive = this.primitive;
        var primitives = this.primitives;
        if (defined(primitive)) {
            primitives.remove(primitive);
        }
        var oldPrimitive = this.oldPrimitive;
        if (defined(oldPrimitive)) {
            primitives.remove(oldPrimitive);
        }
        this.removeMaterialSubscription();
    };

    /**
     * @private
     */
    function StaticGeometryPerMaterialBatch(primitives, appearanceType, closed) {
        this._primitives = primitives;
        this._appearanceType = appearanceType;
        this._closed = closed;
        this._batchesByMaterial = [];
    }

    function isMaterial(material, other) {
        if (material === other) {
            return true;
        }
        if (defined(material) && defined(other)) {
            return material.equals(other);
        }
        return false;
    }

    StaticGeometryPerMaterialBatch.prototype.add = function(time, updater) {
        var castShadows = updater.castShadowsProperty.getValue(time);
        var receiveShadows = updater.receiveShadowsProperty.getValue(time);
        var updaterMaterial = updater.fillMaterialProperty;

        var batch;
        var batches;
        var batchesByMaterial = this._batchesByMaterial;
        var batchKey = '' + (castShadows | 0) + (receiveShadows | 0);

        var length = batchesByMaterial.length;
        for (var i = 0; i < length; i++) {
            var material = batchesByMaterial[i].material;
            batches = batchesByMaterial[i].batches;
            if (isMaterial(material, updaterMaterial)) {
                batch = batches.get(batchKey);
                if (!defined(batch)) {
                    batch = new Batch(this._primitives, this._appearanceType, updaterMaterial, this._closed, castShadows, receiveShadows);
                    batches.set(batchKey, batch);
                }
                batch.add(time, updater);
                return;
            }
        }

        batch = new Batch(this._primitives, this._appearanceType, updaterMaterial, this._closed, castShadows, receiveShadows);
        batch.add(time, updater);
        batches = new AssociativeArray();
        batches.set(batchKey, batch);
        batchesByMaterial.push({
            material : updaterMaterial,
            batches : batches
        });
    };

    StaticGeometryPerMaterialBatch.prototype.remove = function(updater) {
        var batchesByMaterial = this._batchesByMaterial;
        var materialsLength = batchesByMaterial.length;
        for (var i = materialsLength - 1; i >= 0; i--) {
            var batches = batchesByMaterial[i].batches.values;
            var batchesLength = batches.length;
            for (var j = batchesLength - 1; j >= 0; j--) {
                var batch = batches[j];
                if (batch.remove(updater)) {
                    if (batch.updaters.values.length === 0) {
                        batches.splice(j, 1);
                        batch.destroy();
                        if (batches.length === 0) {
                            batchesByMaterial.splice(i, 1);
                        }
                    }
                    break;
                }
            }
        }
    };

    StaticGeometryPerMaterialBatch.prototype.update = function(time) {
        var i;
        var j;
        var batches;
        var batchesLength;
        var batchesByMaterial = this._batchesByMaterial;
        var materialsLength = batchesByMaterial.length;

        for (i = materialsLength - 1; i >= 0; i--) {
            batches = batchesByMaterial[i].batches.values;
            batchesLength = batches.length;
            for (j = batchesLength - 1; j >= 0; j--) {
                var batch = batches[j];

                if (batch.invalidated) {
                    batches.splice(j, 1);
                    var updaters = batch.updaters.values;
                    var updatersLength = updaters.length;
                    for (var h = 0; h < updatersLength; h++) {
                        this.add(time, updaters[h]);
                    }
                    batch.destroy();
                    if (batches.length === 0) {
                        batchesByMaterial.splice(i, 1);
                    }
                } else {
                    //If any items swapped between solid/translucent or changed cast/receive shadows,
                    //we need to move them between batches
                    var itemsToRemove = batch.itemsToRemove;
                    var itemsToMoveLength = itemsToRemove.length;
                    if (itemsToMoveLength > 0) {
                        for (var k = 0; k < itemsToMoveLength; k++) {
                            var updater = itemsToRemove[k];
                            batch.remove(updater);
                            this.add(time, updater);
                        }
                    }
                    if (batch.updaters.values.length === 0) {
                        batches.splice(j, 1);
                        batch.destroy();
                        if (batches.length === 0) {
                            batchesByMaterial.splice(i, 1);
                        }
                    }
                }
            }
        }

        var isUpdated = true;
        for (i = 0; i < materialsLength; i++) {
            batches = batchesByMaterial[i].batches.values;
            batchesLength = batches.length;
            for (j = 0; j < batchesLength; j++) {
                isUpdated = batches[j].update(time) && isUpdated;
            }
        }
        return isUpdated;
    };

    StaticGeometryPerMaterialBatch.prototype.getBoundingSphere = function(entity, result) {
        var batchesByMaterial = this._batchesByMaterial;
        var materialsLength = batchesByMaterial.length;

        for (var i = 0; i < materialsLength; i++) {
            var batches = batchesByMaterial[i].batches.values;
            var batchesLength = batches.length;
            for (var j = 0; j < batchesLength; j++) {
                var batch = batches[j];
                if (batch.contains(entity)) {
                    return batch.getBoundingSphere(entity, result);
                }
            }
        }
        return BoundingSphereState.FAILED;
    };

    StaticGeometryPerMaterialBatch.prototype.removeAllPrimitives = function() {
        var batchesByMaterial = this._batchesByMaterial;
        var materialsLength = batchesByMaterial.length;

        for (var i = 0; i < materialsLength; i++) {
            var batches = batchesByMaterial[i].batches.values;
            var batchesLength = batches.length;
            for (var j = 0; j < batchesLength; j++) {
                batches[j].destroy();
            }
        }

        batchesByMaterial.length = 0;
    };

    return StaticGeometryPerMaterialBatch;
});
