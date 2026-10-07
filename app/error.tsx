'use client';
export default function ErrorPage({reset}:{reset:()=>void}){return <main className="page-loading"><h1>暂时无法打开内容</h1><p>已保存的材料和笔记仍在本机。请重试，或检查本地服务状态。</p><button className="primary-button" onClick={reset}>重新加载</button><a className="text-link" href="/">返回首页</a></main>;}
