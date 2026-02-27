import React from 'react'
import { Provider } from 'react-redux'
import { ThemeProvider } from 'styled-components'
import { BrowserRouter } from 'react-router-dom'
import { store } from '../../store/store'
import { theme } from '../../theme/theme'
import NotificationProvider from './NotificationProvider'
import './i18n'

interface AppProvidersProps {
  children: React.ReactNode
}

const AppProviders: React.FC<AppProvidersProps> = ({ children }) => {
  return (
    <Provider store={store}>
      <ThemeProvider theme={theme}>
        <BrowserRouter>
          <NotificationProvider>{children}</NotificationProvider>
        </BrowserRouter>
      </ThemeProvider>
    </Provider>
  )
}

export default AppProviders
