export type YandexFeature={properties?:{name?:string;description?:string;CompanyMetaData?:{id?:string;name?:string;address?:string;url?:string;Phones?:{formatted?:string;type?:string}[];Address?:{Components?:{kind?:string;name?:string}[]}}}};
export type YandexDraft={name:string;niche:string;city:string;phone:string;site:string;source:string;comment:string;yandexId?:string};
export function makeYandexDraft(feature:YandexFeature,criteria:{niche:string;city:string}):YandexDraft;
export function findYandexDuplicate<T extends {name:string;city:string;phone:string;yandexId?:string}>(draft:YandexDraft,leads:T[]):T|undefined;
