import{r as n,j as e}from"./index-C5pp7-R_.js";function c(a){const i=a.replace(/\D/g,"").substring(0,9);return i.length>6?i.substring(0,3)+"-"+i.substring(3,6)+"-"+i.substring(6,9):i.length>3?i.substring(0,3)+"-"+i.substring(3):i}function d(){const[a,i]=n.useState(""),[s,l]=n.useState("");n.useEffect(()=>{i(""),l("")},[]);const t=c(a);return e.jsxs("main",{"data-loc":"client/src/pages/VerifyTinPage.tsx:22",className:"verify-tin-page",children:[e.jsx("style",{"data-loc":"client/src/pages/VerifyTinPage.tsx:23",children:`
        .verify-tin-page { min-height: 100vh; padding: 28px 20px 70px; background: #f4f6f8; color: #111827; }
        .verify-tin-shell { width: min(1100px, 100%); margin: 0 auto; }
        .verify-tin-header, .verify-tin-form, .verify-tin-preview { background: #fff; border-radius: 14px; box-shadow: 0 4px 15px rgba(0,0,0,.08); }
        .verify-tin-header { padding: 20px; margin-bottom: 20px; }
        .verify-tin-header h1 { margin: 0 0 6px; font-size: 25px; }
        .verify-tin-header p { margin: 0; color: #6b7280; }
        .verify-tin-form { padding: 20px; margin-bottom: 20px; }
        .verify-tin-group { margin-bottom: 18px; }
        .verify-tin-group:last-child { margin-bottom: 0; }
        .verify-tin-label { display: block; margin-bottom: 7px; font-weight: 700; }
        .verify-tin-input { width: 100%; height: 48px; border: 1px solid #d1d5db; border-radius: 9px; padding: 0 14px; font-size: 16px; outline: none; box-sizing: border-box; }
        .verify-tin-input:focus { border-color: #2563eb; box-shadow: 0 0 0 3px rgba(37,99,235,.10); }
        .verify-tin-row { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; }
        .verify-tin-preview { padding: 20px; }
        .verify-tin-preview-title { font-size: 19px; font-weight: 700; margin-bottom: 15px; }
        .verify-tin-wrapper { width: 100%; overflow: hidden; text-align: center; background: #f3f4f6; padding: 15px; border-radius: 10px; box-sizing: border-box; }
        .verify-tin-document { position: relative; display: block; width: min(900px, 100%); margin: 0 auto; line-height: 0; }
        .verify-tin-document img { display: block; width: 100%; max-width: 100%; height: auto; }
        .verify-tin-overlay { position: absolute; font-size: clamp(10px, 2.45vw, 22px); font-weight: bold; color: #000; line-height: normal; white-space: nowrap; }
        .verify-tin-top { top: 8.98%; left: 22.22%; }
        .verify-tin-name { top: 13.48%; left: 22.22%; }
        .verify-tin-bottom { top: 17.97%; left: 22.22%; }
        @media (max-width: 700px) {
          .verify-tin-page { padding: 12px 12px 50px; }
          .verify-tin-row { grid-template-columns: 1fr; gap: 0; }
          .verify-tin-header h1 { font-size: 21px; }
          .verify-tin-form, .verify-tin-preview { padding: 15px; }
          .verify-tin-wrapper { padding: 10px; }
        }
      `}),e.jsxs("div",{"data-loc":"client/src/pages/VerifyTinPage.tsx:55",className:"verify-tin-shell",children:[e.jsxs("header",{"data-loc":"client/src/pages/VerifyTinPage.tsx:56",className:"verify-tin-header",children:[e.jsx("h1",{"data-loc":"client/src/pages/VerifyTinPage.tsx:57",children:"Information Form"}),e.jsx("p",{"data-loc":"client/src/pages/VerifyTinPage.tsx:58",children:"Enter the required information below."})]}),e.jsxs("section",{"data-loc":"client/src/pages/VerifyTinPage.tsx:61",className:"verify-tin-form",children:[e.jsxs("div",{"data-loc":"client/src/pages/VerifyTinPage.tsx:62",className:"verify-tin-group",children:[e.jsx("label",{"data-loc":"client/src/pages/VerifyTinPage.tsx:63",className:"verify-tin-label",htmlFor:"verify-tin-input",children:"TIN Number"}),e.jsx("input",{"data-loc":"client/src/pages/VerifyTinPage.tsx:64",className:"verify-tin-input",id:"verify-tin-input",type:"text",maxLength:11,inputMode:"numeric",placeholder:"",autoComplete:"off",value:t,onChange:r=>i(r.target.value)})]}),e.jsxs("div",{"data-loc":"client/src/pages/VerifyTinPage.tsx:77",className:"verify-tin-row",children:[e.jsxs("div",{"data-loc":"client/src/pages/VerifyTinPage.tsx:78",className:"verify-tin-group",children:[e.jsx("label",{"data-loc":"client/src/pages/VerifyTinPage.tsx:79",className:"verify-tin-label",htmlFor:"verify-name-input",children:"Taxpayer Name"}),e.jsx("input",{"data-loc":"client/src/pages/VerifyTinPage.tsx:80",className:"verify-tin-input",id:"verify-name-input",type:"text",placeholder:"",autoComplete:"off",value:s,onChange:r=>{const o=r.target.value;/^[a-zA-ZÀ-ÿ\\s'-]*$/.test(o)&&l(o.toUpperCase())}})]}),e.jsxs("div",{"data-loc":"client/src/pages/VerifyTinPage.tsx:94",className:"verify-tin-group",children:[e.jsx("label",{"data-loc":"client/src/pages/VerifyTinPage.tsx:95",className:"verify-tin-label",htmlFor:"verify-second-tin",children:"TIN Number"}),e.jsx("input",{"data-loc":"client/src/pages/VerifyTinPage.tsx:96",className:"verify-tin-input",id:"verify-second-tin",type:"text",readOnly:!0,placeholder:"",value:t})]})]})]}),e.jsxs("section",{"data-loc":"client/src/pages/VerifyTinPage.tsx:108",className:"verify-tin-preview",children:[e.jsx("div",{"data-loc":"client/src/pages/VerifyTinPage.tsx:109",className:"verify-tin-preview-title",children:"Live Preview"}),e.jsx("div",{"data-loc":"client/src/pages/VerifyTinPage.tsx:110",className:"verify-tin-wrapper",children:e.jsxs("div",{"data-loc":"client/src/pages/VerifyTinPage.tsx:111",className:"verify-tin-document",children:[e.jsx("img",{"data-loc":"client/src/pages/VerifyTinPage.tsx:112",src:"/Huduma-za-mitandaoni/Verify.png",alt:"Verify TIN Preview Template"}),e.jsx("div",{"data-loc":"client/src/pages/VerifyTinPage.tsx:116",className:"verify-tin-overlay verify-tin-top",children:t}),e.jsx("div",{"data-loc":"client/src/pages/VerifyTinPage.tsx:117",className:"verify-tin-overlay verify-tin-name",children:s}),e.jsx("div",{"data-loc":"client/src/pages/VerifyTinPage.tsx:118",className:"verify-tin-overlay verify-tin-bottom",children:t})]})})]})]})]})}export{d as default};
