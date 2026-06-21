import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import 'antd/dist/reset.css';
// 自托管字体（构建时打包进 dist，服务器自托管，国内访问无需连 Google Fonts）
import '@fontsource/baloo-2/400.css';
import '@fontsource/baloo-2/600.css';
import '@fontsource/baloo-2/700.css';
import '@fontsource/baloo-2/800.css';
import '@fontsource/nunito/400.css';
import '@fontsource/nunito/600.css';
import '@fontsource/nunito/700.css';
import '@fontsource/nunito/800.css';
import '@fontsource/geist-mono/400.css';
import '@fontsource/geist-mono/500.css';
import '@fontsource/geist-mono/700.css';
import './styles.css';
import App from './App.js';

const NUNITO_STACK = "'Nunito', 'Helvetica Neue', Helvetica, Arial, sans-serif";

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ConfigProvider
      locale={zhCN}
      theme={{
        token: {
          colorPrimary: '#6b4fbb',
          colorInfo: '#1cb0f6',
          colorSuccess: '#58cc02',
          colorWarning: '#f5a623',
          colorError: '#ff433e',
          borderRadius: 12,
          fontSize: 15,
          fontFamily: NUNITO_STACK,
          colorTextBase: '#1f2937',
        },
        components: {
          Button: { fontWeight: 700, primaryShadow: 'none' },
          Table: { headerBg: '#f7f4fb', borderColor: '#e5e2ee' },
          Segmented: { itemSelectedBg: '#6b4fbb', itemSelectedColor: '#ffffff' },
        },
      }}
    >
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ConfigProvider>
  </React.StrictMode>,
);
