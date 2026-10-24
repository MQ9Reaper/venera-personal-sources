import vm from 'node:vm';
import fs from 'node:fs';
import { parseHTML } from 'linkedom';

// Emulate the app bridge, including the actual upstream init.js when supplied.
// No real credentials or network connections are used by the tests.
export function runtime(handler = async () => ({ status: 200, body: '{}' })) {
    const data = {}, docs = new Map(), nodes = new Map(), messages = [], calls = [];
    let cookies = [], serial = 0;
    const matches = (c, url) => {
        const host = new URL(url).hostname;
        const domain = (c.domain || host).replace(/^\./, '');
        return host === domain || (c.domain.startsWith('.') && host.endsWith('.' + domain));
    };
    const nodeId = node => {
        if (!node) return null;
        const id = ++serial; nodes.set(id, node); return id;
    };
    function sendMessage(m) {
        if (m.method === 'load_data') return data[m.data_key];
        if (m.method === 'save_data') { data[m.data_key] = m.data; return; }
        if (m.method === 'delete_data') { delete data[m.data_key]; return; }
        if (m.method === 'cookie') {
            if (m.function === 'get') return cookies.filter(c => matches(c, m.url)).map(c => ({ ...c }));
            if (m.function === 'delete') { cookies = cookies.filter(c => !matches(c, m.url)); return; }
            for (const c of m.cookies) {
                cookies = cookies.filter(old => old.name !== c.name || old.domain !== c.domain);
                cookies.push({ ...c, domain: c.domain || new URL(m.url).hostname });
            }
            return;
        }
        if (m.method === 'http') {
            calls.push(m);
            return handler(m, cookies.filter(c => matches(c, m.url)));
        }
        if (m.method === 'ui' || m.method === 'UI') { messages.push(m); return; }
        if (m.method === 'html') {
            if (m.function === 'parse') { docs.set(m.key, parseHTML(m.data).document); return; }
            if (m.function === 'dispose') { docs.delete(m.key); nodes.clear(); return; }
            const root = m.doc == null ? docs.get(m.key) : nodes.get(m.key);
            if (m.function === 'querySelector' || m.function === 'dom_querySelector') return nodeId(root.querySelector(m.query));
            if (m.function === 'querySelectorAll' || m.function === 'dom_querySelectorAll') return [...root.querySelectorAll(m.query)].map(nodeId);
            if (m.function === 'getAttributes') return Object.fromEntries([...root.attributes].map(a => [a.name, a.value]));
            if (m.function === 'getText') return root.textContent;
        }
        throw new Error('Unexpected bridge call: ' + m.method + '/' + m.function);
    }
    const shim = `
        class ComicSource {
            loadData(k) { return sendMessage({method:'load_data',data_key:k}); }
            saveData(k,v) { sendMessage({method:'save_data',data_key:k,data:v}); }
            deleteData(k) { sendMessage({method:'delete_data',data_key:k}); }
        }
        function Cookie(o) { Object.assign(this,o); }
        const Network = {
            get: (url,headers) => sendMessage({method:'http',http_method:'GET',url,headers}),
            getCookies: url => sendMessage({method:'cookie',function:'get',url}),
            setCookies: (url,cookies) => sendMessage({method:'cookie',function:'set',url,cookies}),
            deleteCookies: url => sendMessage({method:'cookie',function:'delete',url})
        };
        const UI = {
            showMessage: message => sendMessage({method:'ui',message}),
            launchUrl: url => sendMessage({method:'ui',url})
        };
        class HtmlDocument {
            static serial=0;
            constructor(data) { this.key=++HtmlDocument.serial; sendMessage({method:'html',function:'parse',key:this.key,data}); }
            querySelector(query) { const id=sendMessage({method:'html',function:'querySelector',key:this.key,query}); return id == null ? null : new HtmlElement(id,this.key); }
            querySelectorAll(query) { return sendMessage({method:'html',function:'querySelectorAll',key:this.key,query}).map(id=>new HtmlElement(id,this.key)); }
            dispose() { sendMessage({method:'html',function:'dispose',key:this.key}); }
        }
        class HtmlElement {
            constructor(key,doc) { this.key=key;this.doc=doc; }
            get attributes() { return sendMessage({method:'html',function:'getAttributes',key:this.key,doc:this.doc}); }
            get text() { return sendMessage({method:'html',function:'getText',key:this.key,doc:this.doc}); }
            querySelector(query) { const id=sendMessage({method:'html',function:'dom_querySelector',key:this.key,doc:this.doc,query}); return id == null ? null : new HtmlElement(id,this.doc); }
        }
    `;
    const init = process.env.VENERA_INIT ? fs.readFileSync(process.env.VENERA_INIT, 'utf8') : shim;
    const context = vm.createContext({ sendMessage });
    vm.runInContext(init + '\n' + fs.readFileSync(new URL('../fanbox.js', import.meta.url), 'utf8') + '\nglobalThis.source = new Fanbox();', context);
    return { source: context.source, context, data, docs, calls, messages, get cookies() { return cookies; } };
}

export const json = body => ({ status: 200, body: JSON.stringify(body) });
export const html = body => ({ status: 200, body });
export const tokenPage = '<html><head><meta content="test-csrf" name="csrf-token"></head><body></body></html>';
