import Axios, { AxiosRequestConfig } from 'axios'

const axiosInstance = Axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
})

export const axios = <T>(config: AxiosRequestConfig): Promise<T> => {
  return axiosInstance(config).then(({ data }) => data)
}
