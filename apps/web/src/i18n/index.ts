import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { ptBR } from './pt-BR';

void i18n.use(initReactI18next).init({
  lng: 'pt-BR',
  fallbackLng: 'pt-BR',
  resources: { 'pt-BR': { translation: ptBR } },
  interpolation: { escapeValue: false },
});

export default i18n;
