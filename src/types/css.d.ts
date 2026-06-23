// Объявления для CSS-импортов (обрабатываются Metro/Expo, не tsc)
declare module '*.css';
declare module '*.module.css' {
  const classes: { readonly [key: string]: string };
  export default classes;
}
