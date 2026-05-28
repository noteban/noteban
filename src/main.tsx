import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import { installAccessoryBridge } from './lib/accessoryBridge'
import { isIOS } from './utils/platform'

if (isIOS) {
  document.documentElement.classList.add('platform-ios')
  document
    .querySelector('meta[name="viewport"]')
    ?.setAttribute(
      'content',
      'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover'
    )
  installAccessoryBridge()
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
