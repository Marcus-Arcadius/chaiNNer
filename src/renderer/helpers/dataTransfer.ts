import log from 'electron-log';
import { extname } from 'path';
import { XYPosition } from 'reactflow';
import { InputId, SchemaId } from '../../common/common-types';
import { ipcRenderer } from '../../common/safeIpc';
import { openSaveFile } from '../../common/SaveFile';
import { SchemaMap } from '../../common/SchemaMap';
import { NodeProto } from './reactFlowUtil';

export interface ChainnerDragData {
    schemaId: SchemaId;
    offsetX?: number;
    offsetY?: number;
}

export const enum TransferTypes {
    ChainnerSchema = 'application/chainner/schema',
}

export interface DataTransferProcessorOptions {
    createNode: (proto: NodeProto) => void;
    getNodePosition: (offsetX?: number, offsetY?: number) => XYPosition;
    schemata: SchemaMap;
}

export const getSingleFileWithExtension = (
    dataTransfer: DataTransfer,
    allowedExtensions: readonly string[]
): string | undefined => {
    if (dataTransfer.files.length === 1) {
        const [file] = dataTransfer.files;
        const extension = extname(file.path).toLowerCase();
        if (allowedExtensions.includes(extension)) {
            return file.path;
        }
    }
    return undefined;
};

/**
 * Returns `false` if the data could not be processed by this processor.
 *
 * Returns `true` if the data has been successfully transferred.
 */
export type DataTransferProcessor = (
    dataTransfer: DataTransfer,
    options: DataTransferProcessorOptions
) => boolean;

const chainnerSchemaProcessor: DataTransferProcessor = (
    dataTransfer,
    { getNodePosition, createNode, schemata }
) => {
    if (!dataTransfer.getData(TransferTypes.ChainnerSchema)) return false;

    const { schemaId, offsetX, offsetY } = JSON.parse(
        dataTransfer.getData(TransferTypes.ChainnerSchema)
    ) as ChainnerDragData;

    const nodeSchema = schemata.get(schemaId);

    createNode({
        position: getNodePosition(offsetX, offsetY),
        data: { schemaId },
        nodeType: nodeSchema.nodeType,
    });
    return true;
};

const openChainnerFileProcessor: DataTransferProcessor = (dataTransfer) => {
    if (dataTransfer.files.length === 1) {
        const [file] = dataTransfer.files;
        if (/\.chn/i.test(file.path)) {
            // found a .chn file

            openSaveFile(file.path)
                .then((result) => {
                    // TODO: 1 is hard-coded. Find a better way
                    ipcRenderer.sendTo(1, 'file-open', result);
                })
                .catch((reason) => log.error(reason));

            return true;
        }
    }
    return false;
};

const openImageFileProcessor: DataTransferProcessor = (
    dataTransfer,
    { schemata, getNodePosition, createNode }
) => {
    const LOAD_IMAGE_ID = 'chainner:image:load' as SchemaId;
    if (!schemata.has(LOAD_IMAGE_ID)) return false;
    const schema = schemata.get(LOAD_IMAGE_ID);
    const fileTypes = schema.inputs[0]?.filetypes;
    if (!fileTypes) return false;

    const path = getSingleFileWithExtension(dataTransfer, fileTypes);
    if (path) {
        // found a supported image file

        createNode({
            // hard-coded offset because it looks nicer
            position: getNodePosition(100, 100),
            data: {
                schemaId: LOAD_IMAGE_ID,
                inputData: { [0 as InputId]: path },
            },
            nodeType: schema.nodeType,
        });

        return true;
    }
    return false;
};

export const dataTransferProcessors: readonly DataTransferProcessor[] = [
    chainnerSchemaProcessor,
    openChainnerFileProcessor,
    openImageFileProcessor,
];
