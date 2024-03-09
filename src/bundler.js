import fs from "fs";
import babylon from "babylon";
import traverse from "@babel/traverse";
import path from "path";
import babel from "@babel/core";

let ID = 0;

function createAsset(filePath) {
    // create asset objects with include
    // the content
    // the unique identifier
    // the dependencies
    // ast
    const content = fs.readFileSync(filePath, 'utf-8');
    const ast = babylon.parse(content, { sourceType: "module" });
    const dependencies = [];
    traverse.default(ast, {
        ImportDeclaration: ({ node }) => {
            const importPath = node.source.value;
            const dependency = { relative: false, absolute: false, external: false, importPath };

            if (path.isAbsolute(importPath)) {
                dependency.absolute = true;
                dependency.external = true;
            }
            else if (importPath.startsWith("./") || importPath.startsWith("../")) {
                dependency.external = true;
                dependency.relative = true;
            }
            dependencies.push(dependency);
        }
    });
    const id = ID++;
    const { code } = babel.transformFromAstSync(ast, null, { presets: ['@babel/preset-env'] });
    return {
        id,
        dependencies,
        filePath,
        code,
    }
}

function createGraph(entryFilePath) {
    const mainAsset = createAsset(entryFilePath);

    const queue = [mainAsset];

    for (const asset of queue) {
        asset.mapping = {};
        const dirName = path.dirname(asset.filePath);
        asset.dependencies.forEach(({ importPath, external, absolute, relative }) => {
            let childAsset = null;
            if (external) {
                if (absolute) {
                    childAsset = createAsset(importPath);
                }
                else if (relative) {
                    const absolutePath = path.join(dirName, importPath);
                    childAsset = createAsset(absolutePath);
                }
            }
            if (childAsset) {
                queue.push(childAsset);
                asset.mapping[importPath] = childAsset.id;
            }
        });
    }
    return queue;
}


function bundle(graph) {
    let modules = ``;
    graph.forEach(mod => {
        modules += `${mod.id}:[
            function(require, module, exports){
                ${mod.code}
            },
            ${JSON.stringify(mod.mapping)}
        ],`;
    })
    const result = `
        (function(moduleMapping){
            function require(id){
                const [fn, assetPathMapping] = moduleMapping[id];

                // function to returnt the asset corresponding to the path
                function localRequire(path){
                    return require(assetPathMapping[path]);
                }

                const module = {exports : {}};
                fn(localRequire, module, module.exports);
                return module.exports;
            }

            require(0);
        }({${modules}}))
    `;
    return result;
}

const graph = createGraph("../example/entry.js");
const result = bundle(graph);
console.log(result);