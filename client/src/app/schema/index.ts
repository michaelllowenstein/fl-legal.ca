import * as Constant from './constants';
import * as Model from './models';
import * as Utils from './utils';

export type Schema = {
    Constant: typeof Constant;
    Model: typeof Model;
    Utils: typeof Utils;
}

export const Schema: Schema = {
    Constant,
    Model,
    Utils,
}